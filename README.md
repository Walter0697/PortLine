# PortLine 🐳

A beautiful Docker port visualizer that displays container port usage on an interactive, gradient line.

![PortLine](https://img.shields.io/badge/Go-1.21-00ADD8?style=for-the-badge&logo=go)
![Docker](https://img.shields.io/badge/Docker-Required-2496ED?style=for-the-badge&logo=docker)
![HTMX](https://img.shields.io/badge/HTMX-Powered-3D72D7?style=for-the-badge)

## Features

- 🎨 **Beautiful Visualization** - Cute gradient line with animated dots representing ports
- 🔄 **Real-time Updates** - Auto-refreshes every 5 seconds using HTMX
- 📊 **Dual Orientation** - Toggle between horizontal and vertical views
- 💡 **Rich Tooltips** - Hover over dots to see container details
- 🐋 **Docker Integration** - Connects directly to Docker socket
- 🚀 **Lightweight** - Built with Go for minimal resource usage

## Prerequisites

- Go 1.21 or later
- Docker running on your system
- Access to `/var/run/docker.sock`

## API Key Authentication

PortLine includes API key authentication to protect your Docker information. 

### Setup

1. **Set your API key** via environment variable:
   ```bash
   export API_KEY=your-secret-api-key-here
   ```

2. **Or create a `.env` file** (see `.env.example`):
   ```bash
   API_KEY=your-secret-api-key-here
   ```

### Usage

**Method 1: Login Page**
1. Access the application at `http://localhost:3000`
2. Enter your API key in the login form
3. The key is stored in your browser's localStorage
4. Click the logout button (🔓) in the top-right to clear the key

**Method 2: URL Parameter**
1. Access with API key in URL: `http://localhost:3000?apiKey=your-secret-api-key-here`
2. The key is automatically validated and stored
3. The API key is removed from the URL for security

**Note**: The `API_KEY` environment variable is **required**. The server will not start without it.



## Local Development

1. **Clone the repository** (or navigate to the project directory)

2. **Run the development script**:
   ```bash
   chmod +x dev.sh
   ./dev.sh
   ```

3. **Open your browser** to `http://localhost:8080`

The application will connect to your local Docker socket and display all containers with exposed ports.

## Docker Deployment

### Build the Docker image

```bash
docker build -t portline .
```

### Run the container

```bash
docker run -d \
  --name portline \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  portline
```

**Important**: The `-v /var/run/docker.sock:/var/run/docker.sock` flag gives the container access to the host's Docker daemon.

### Access the application

Open your browser to `http://localhost:8080`

## How It Works

1. **Backend**: Go application connects to Docker socket via Docker SDK
2. **API**: Exposes `/api/ports` endpoint that returns container port information
3. **Frontend**: HTMX polls the API and updates the visualization dynamically
4. **Visualization**: JavaScript renders dots on a gradient line based on port numbers

## API Endpoints

- `GET /` - Main application page
- `GET /api/ports` - Returns JSON with port information (requires API key)
  ```json
  {
    "ports": [
      {
        "port": 8080,
        "containerName": "my-app",
        "imageName": "nginx:latest",
        "containerId": "abc123def456"
      }
    ],
    "maxPort": 8080
  }
  ```
- `POST /api/validate-key` - Validates an API key
  ```json
  // Request
  { "apiKey": "your-key" }
  
  // Response
  { "valid": true }
  ```

**Authentication**: API endpoints require the `Authorization: Bearer <api-key>` header when an API key is configured.


## Project Structure

```
PortLine/
├── main.go           # HTTP server and routing
├── docker.go         # Docker API client
├── templates/        # HTML templates
│   └── index.html
├── static/           # CSS and JavaScript
│   ├── style.css
│   └── app.js
├── Dockerfile        # Multi-stage Docker build
├── .dockerignore     # Docker build exclusions
├── dev.sh           # Development script
├── go.mod           # Go module definition
└── README.md        # This file
```

## Customization

### Port Range

By default, the visualization shows ports from 0 to the maximum port found. To change this, modify the `GetPortInfo` function in `docker.go`.

### Refresh Interval

To change the auto-refresh interval, edit the `hx-trigger` attribute in `templates/index.html`:

```html
hx-trigger="load, every 5s"  <!-- Change 5s to your desired interval -->
```

### Colors

Customize the color scheme by editing CSS variables in `static/style.css`:

```css
:root {
    --accent-primary: #00d4ff;
    --accent-secondary: #ff006e;
    --accent-tertiary: #8338ec;
}
```

## Security Note

⚠️ **Warning**: Mounting the Docker socket gives the container full access to your Docker daemon. Only run this in trusted environments.

## License

MIT

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.
