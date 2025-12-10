package main

import (
	"context"
	"fmt"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type DockerClient struct {
	cli *client.Client
}

type PortInfo struct {
	Port          int    `json:"port"`
	ContainerName string `json:"containerName"`
	ImageName     string `json:"imageName"`
	ContainerID   string `json:"containerId"`
}

type PortsResponse struct {
	Ports   []PortInfo `json:"ports"`
	MaxPort int        `json:"maxPort"`
}

func NewDockerClient() (*DockerClient, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	return &DockerClient{cli: cli}, nil
}

func (dc *DockerClient) Close() error {
	if dc.cli != nil {
		return dc.cli.Close()
	}
	return nil
}

func (dc *DockerClient) GetPortInfo(ctx context.Context) (*PortsResponse, error) {
	containers, err := dc.cli.ContainerList(ctx, container.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}

	var ports []PortInfo
	maxPort := 0
	seenPorts := make(map[string]bool) // Track unique port+container combinations

	for _, ctr := range containers {
		containerName := ctr.Names[0]
		if len(containerName) > 0 && containerName[0] == '/' {
			containerName = containerName[1:] // Remove leading slash
		}

		// Extract port mappings from Ports array
		for _, port := range ctr.Ports {
			if port.PublicPort > 0 {
				portNum := int(port.PublicPort)
				key := fmt.Sprintf("%s:%d", ctr.ID, portNum)
				
				if !seenPorts[key] {
					portInfo := PortInfo{
						Port:          portNum,
						ContainerName: containerName,
						ImageName:     ctr.Image,
						ContainerID:   ctr.ID[:12], // Short ID
					}
					
					ports = append(ports, portInfo)
					seenPorts[key] = true
					
					if portNum > maxPort {
						maxPort = portNum
					}
				}
			}
			
			// Also check private port if no public port
			if port.PublicPort == 0 && port.PrivatePort > 0 {
				portNum := int(port.PrivatePort)
				key := fmt.Sprintf("%s:%d", ctr.ID, portNum)
				
				if !seenPorts[key] {
					portInfo := PortInfo{
						Port:          portNum,
						ContainerName: containerName,
						ImageName:     ctr.Image,
						ContainerID:   ctr.ID[:12],
					}
					
					ports = append(ports, portInfo)
					seenPorts[key] = true
					
					if portNum > maxPort {
						maxPort = portNum
					}
				}
			}
		}
	}

	// Ensure we have a reasonable max port (at least 1024 for visualization)
	if maxPort < 1024 {
		maxPort = 1024
	}

	return &PortsResponse{
		Ports:   ports,
		MaxPort: maxPort,
	}, nil
}
