import { StyleSheet } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { env } from '../env';

/**
 * Supabase requires a Cloudflare Turnstile token for sign-in. The widget runs
 * in a small web view whose base URL is the production site, so the token is
 * issued for the hostname the widget is configured to allow.
 */
function html(siteKey: string) {
  return [
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=boot&render=explicit" async defer></script>',
    '<style>html,body{margin:0;background:transparent;display:flex;justify-content:center}</style></head>',
    '<body><div id="t"></div><script>',
    'function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))}',
    `function boot(){turnstile.render('#t',{sitekey:${JSON.stringify(siteKey)},theme:'dark',`,
    "callback:function(token){post({type:'token',token:token})},",
    "'error-callback':function(){post({type:'error'})},",
    "'expired-callback':function(){post({type:'expired'})}})}",
    '</script></body></html>',
  ].join('\n');
}

export function TurnstileGate({ onToken, onError }: { onToken(token: string): void; onError(): void }) {
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { type: string; token?: string };
      if (m.type === 'token' && m.token) onToken(m.token);
      else onError();
    } catch {
      onError();
    }
  };
  return (
    <WebView
      source={{ html: html(env.turnstileSiteKey), baseUrl: 'https://bonamind.app' }}
      onMessage={onMessage}
      style={styles.view}
      scrollEnabled={false}
      originWhitelist={['https://*']}
      setSupportMultipleWindows={false}
    />
  );
}

const styles = StyleSheet.create({ view: { height: 72, backgroundColor: 'transparent' } });
