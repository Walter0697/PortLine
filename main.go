package main

import (
	"context"
	"embed"
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
)

//go:embed templates/*
var templatesFS embed.FS

//go:embed static/*
var staticFS embed.FS

func main() {
	// Load .env file if it exists
	_ = godotenv.Load()

	// Initialize Docker client
	dockerClient, err := NewDockerClient()
	if err != nil {
		log.Fatalf("Failed to create Docker client: %v", err)
	}
	defer dockerClient.Close()

	// Read API key from environment (REQUIRED)
	apiKey := os.Getenv("API_KEY")
	if apiKey == "" {
		log.Fatalf("ERROR: API_KEY environment variable is required. Please set it in .env file or export it.")
	}

	// Create app instance
	app := &App{
		dockerClient: dockerClient,
		apiKey:       apiKey,
	}

	// Set up HTTP routes
	mux := http.NewServeMux()
	
	// Serve static files
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))))
	
	// API routes (protected)
	mux.HandleFunc("/api/ports", app.requireAPIKey(app.handleGetPorts))
	mux.HandleFunc("/api/validate-key", app.handleValidateKey)
	
	// Main page
	mux.HandleFunc("/", app.handleIndex)

	// Create server
	server := &http.Server{
		Addr:         ":3000",
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("Server starting on http://localhost:3000")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Server shutting down...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}

type App struct {
	dockerClient *DockerClient
	apiKey       string
}

// AppVersion is the current version of the application
const AppVersion = "v1.0.0"

func (a *App) handleIndex(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFS(templatesFS, "templates/index.html")
	if err != nil {
		http.Error(w, "Failed to load template", http.StatusInternalServerError)
		log.Printf("Template error: %v", err)
		return
	}

	data := struct {
		Version string
	}{
		Version: AppVersion,
	}

	if err := tmpl.Execute(w, data); err != nil {
		log.Printf("Template execution error: %v", err)
	}
}

func (a *App) handleGetPorts(w http.ResponseWriter, r *http.Request) {
	ports, err := a.dockerClient.GetPortInfo(r.Context())
	if err != nil {
		http.Error(w, "Failed to get port information", http.StatusInternalServerError)
		log.Printf("Docker API error: %v", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(ports); err != nil {
		log.Printf("JSON encoding error: %v", err)
	}
}

// requireAPIKey is a middleware that validates the API key
func (a *App) requireAPIKey(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get API key from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Missing API key", http.StatusUnauthorized)
			return
		}

		// Check if it matches (expecting "Bearer <key>" format)
		expectedAuth := "Bearer " + a.apiKey
		if authHeader != expectedAuth {
			http.Error(w, "Invalid API key", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}

// handleValidateKey validates an API key sent in the request body
func (a *App) handleValidateKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		APIKey string `json:"apiKey"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	valid := req.APIKey == a.apiKey
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"valid": valid})
}

