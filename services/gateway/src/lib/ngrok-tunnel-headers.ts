/**
 * ngrok free-tier tunnels return 403 + HTML interstitial unless outbound
 * requests include this header. The literal "true" is unreliable from some
 * runtimes; "69420" matches common ngrok bypass examples.
 *
 * @see https://ngrok.com/docs/pricing-limits/free-plan-limits/#removing-the-interstitial-page
 */
export const ngrokTunnelRequestHeaders: Record<string, string> = {
  "ngrok-skip-browser-warning": "69420",
  "User-Agent": "osp-gateway/1.0",
};
