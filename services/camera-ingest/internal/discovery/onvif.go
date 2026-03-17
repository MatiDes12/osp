// Package discovery implements ONVIF WS-Discovery for camera detection on the local network.
package discovery

import (
	"context"
	"encoding/xml"
	"fmt"
	"net"
	"regexp"
	"strings"
	"time"
)

const (
	wsDiscoveryMulticastAddr = "239.255.255.250:3702"
	defaultDiscoveryTimeout  = 10 * time.Second
	maxUDPResponseSize       = 8192
)

// wsDiscoveryProbe is the SOAP envelope for a WS-Discovery Probe targeting ONVIF devices.
const wsDiscoveryProbe = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:NetworkVideoTransmitter</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`

// DiscoveredDevice holds information about an ONVIF device found during discovery.
type DiscoveredDevice struct {
	IP           string
	Port         int
	Manufacturer string
	Model        string
	XAddr        string
}

// probeMatchEnvelope represents the minimal XML structure needed to parse WS-Discovery responses.
type probeMatchEnvelope struct {
	XMLName xml.Name `xml:"Envelope"`
	Body    struct {
		ProbeMatches struct {
			Matches []probeMatch `xml:"ProbeMatch"`
		} `xml:"ProbeMatches"`
	} `xml:"Body"`
}

type probeMatch struct {
	XAddrs string `xml:"XAddrs"`
	Scopes string `xml:"Scopes"`
}

// xaddrRegexp extracts host:port from an ONVIF XAddr URL.
var xaddrRegexp = regexp.MustCompile(`https?://([^/]+)`)

// Discover sends a WS-Discovery multicast probe and collects ONVIF device responses.
// The timeout parameter controls how long to wait; zero uses the default of 10 seconds.
func Discover(ctx context.Context, timeout time.Duration) ([]DiscoveredDevice, error) {
	if timeout <= 0 {
		timeout = defaultDiscoveryTimeout
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	addr, err := net.ResolveUDPAddr("udp4", wsDiscoveryMulticastAddr)
	if err != nil {
		return nil, fmt.Errorf("onvif discovery: resolve multicast addr: %w", err)
	}

	conn, err := net.ListenUDP("udp4", nil)
	if err != nil {
		return nil, fmt.Errorf("onvif discovery: listen UDP: %w", err)
	}
	defer conn.Close()

	if _, err := conn.WriteToUDP([]byte(wsDiscoveryProbe), addr); err != nil {
		return nil, fmt.Errorf("onvif discovery: send probe: %w", err)
	}

	var devices []DiscoveredDevice
	seen := make(map[string]bool)
	buf := make([]byte, maxUDPResponseSize)

	for {
		select {
		case <-ctx.Done():
			return devices, nil
		default:
		}

		// Set a per-read deadline so we can check context between reads.
		if err := conn.SetReadDeadline(time.Now().Add(1 * time.Second)); err != nil {
			return devices, fmt.Errorf("onvif discovery: set deadline: %w", err)
		}

		n, _, readErr := conn.ReadFromUDP(buf)
		if readErr != nil {
			if netErr, ok := readErr.(net.Error); ok && netErr.Timeout() {
				continue
			}
			return devices, fmt.Errorf("onvif discovery: read UDP: %w", readErr)
		}

		parsed, parseErr := parseProbeResponse(buf[:n])
		if parseErr != nil {
			// Skip malformed responses.
			continue
		}

		for _, d := range parsed {
			if !seen[d.XAddr] {
				seen[d.XAddr] = true
				devices = append(devices, d)
			}
		}
	}
}

// parseProbeResponse extracts device information from a WS-Discovery ProbeMatch response.
func parseProbeResponse(data []byte) ([]DiscoveredDevice, error) {
	var envelope probeMatchEnvelope
	if err := xml.Unmarshal(data, &envelope); err != nil {
		return nil, fmt.Errorf("parse probe response: %w", err)
	}

	var devices []DiscoveredDevice
	for _, match := range envelope.Body.ProbeMatches.Matches {
		xaddrs := strings.Fields(match.XAddrs)
		for _, xaddr := range xaddrs {
			device := DiscoveredDevice{
				XAddr: xaddr,
			}

			// Extract IP and port from XAddr.
			if m := xaddrRegexp.FindStringSubmatch(xaddr); len(m) > 1 {
				hostPort := m[1]
				host, portStr, err := net.SplitHostPort(hostPort)
				if err != nil {
					// No port in URL, default to 80.
					device.IP = hostPort
					device.Port = 80
				} else {
					device.IP = host
					port := 80
					fmt.Sscanf(portStr, "%d", &port)
					device.Port = port
				}
			}

			// Extract manufacturer and model from scopes.
			device.Manufacturer, device.Model = parseScopeFields(match.Scopes)

			devices = append(devices, device)
		}
	}

	return devices, nil
}

// parseScopeFields extracts manufacturer (hardware) and model (name) from ONVIF scope URIs.
// Scopes look like: onvif://www.onvif.org/hardware/Manufacturer onvif://www.onvif.org/name/Model
func parseScopeFields(scopes string) (manufacturer, model string) {
	for _, scope := range strings.Fields(scopes) {
		lower := strings.ToLower(scope)
		switch {
		case strings.Contains(lower, "/hardware/"):
			parts := strings.SplitAfter(scope, "/hardware/")
			if len(parts) > 1 {
				manufacturer = strings.TrimSpace(parts[1])
			}
		case strings.Contains(lower, "/name/"):
			parts := strings.SplitAfter(scope, "/name/")
			if len(parts) > 1 {
				model = strings.TrimSpace(parts[1])
			}
		}
	}
	return manufacturer, model
}
