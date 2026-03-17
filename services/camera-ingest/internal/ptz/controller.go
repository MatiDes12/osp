// Package ptz provides PTZ (Pan-Tilt-Zoom) camera control via ONVIF SOAP requests.
// This is a simplified MVP implementation that sends raw SOAP envelopes over HTTP.
package ptz

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

const defaultHTTPTimeout = 10 * time.Second

// Controller sends PTZ commands to ONVIF-compatible cameras.
type Controller struct {
	httpClient *http.Client
}

// NewController creates a new PTZ controller.
func NewController() *Controller {
	return &Controller{
		httpClient: &http.Client{
			Timeout: defaultHTTPTimeout,
		},
	}
}

// Move sends a ContinuousMove command with the given pan, tilt, zoom, and speed values.
// Pan and tilt range from -1.0 to 1.0. Zoom ranges from -1.0 to 1.0. Speed ranges from 0.0 to 1.0.
func (c *Controller) Move(ctx context.Context, onvifURL string, pan, tilt, zoom, speed float32) error {
	if onvifURL == "" {
		return fmt.Errorf("ptz: ONVIF URL must not be empty")
	}

	envelope := fmt.Sprintf(continuousMoveEnvelope, pan, tilt, zoom)
	return c.sendSOAP(ctx, onvifURL, continuousMoveAction, envelope)
}

// Stop sends a Stop command to halt all PTZ movement on the camera.
func (c *Controller) Stop(ctx context.Context, onvifURL string) error {
	if onvifURL == "" {
		return fmt.Errorf("ptz: ONVIF URL must not be empty")
	}

	return c.sendSOAP(ctx, onvifURL, stopAction, stopEnvelope)
}

// GotoPreset moves the camera to a saved preset position.
func (c *Controller) GotoPreset(ctx context.Context, onvifURL, presetID string) error {
	if onvifURL == "" {
		return fmt.Errorf("ptz: ONVIF URL must not be empty")
	}
	if presetID == "" {
		return fmt.Errorf("ptz: preset ID must not be empty")
	}

	envelope := fmt.Sprintf(gotoPresetEnvelope, presetID)
	return c.sendSOAP(ctx, onvifURL, gotoPresetAction, envelope)
}

// sendSOAP posts a SOAP envelope to the ONVIF PTZ service endpoint.
func (c *Controller) sendSOAP(ctx context.Context, onvifURL, action, envelope string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, onvifURL, bytes.NewBufferString(envelope))
	if err != nil {
		return fmt.Errorf("ptz: create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/soap+xml; charset=utf-8")
	req.Header.Set("SOAPAction", action)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("ptz: send SOAP to %s: %w", onvifURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("ptz: SOAP request to %s returned %d: %s", onvifURL, resp.StatusCode, string(body))
	}

	return nil
}

// SOAP action URIs for ONVIF PTZ operations.
const (
	continuousMoveAction = "http://www.onvif.org/ver20/ptz/wsdl/ContinuousMove"
	stopAction           = "http://www.onvif.org/ver20/ptz/wsdl/Stop"
	gotoPresetAction     = "http://www.onvif.org/ver20/ptz/wsdl/GotoPreset"
)

// SOAP envelope templates.
// These are simplified envelopes that work with most ONVIF-compliant cameras.
// The profile token is set to "000" as a common default; production code should
// discover available profiles via GetProfiles first.

const continuousMoveEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
            xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <tptz:ContinuousMove>
      <tptz:ProfileToken>000</tptz:ProfileToken>
      <tptz:Velocity>
        <tt:PanTilt x="%.2f" y="%.2f" space="http://www.onvif.org/ver10/tptz/PanTiltSpaces/VelocityGenericSpace"/>
        <tt:Zoom x="%.2f" space="http://www.onvif.org/ver10/tptz/ZoomSpaces/VelocityGenericSpace"/>
      </tptz:Velocity>
    </tptz:ContinuousMove>
  </s:Body>
</s:Envelope>`

const stopEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <s:Body>
    <tptz:Stop>
      <tptz:ProfileToken>000</tptz:ProfileToken>
      <tptz:PanTilt>true</tptz:PanTilt>
      <tptz:Zoom>true</tptz:Zoom>
    </tptz:Stop>
  </s:Body>
</s:Envelope>`

const gotoPresetEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <s:Body>
    <tptz:GotoPreset>
      <tptz:ProfileToken>000</tptz:ProfileToken>
      <tptz:PresetToken>%s</tptz:PresetToken>
    </tptz:GotoPreset>
  </s:Body>
</s:Envelope>`
