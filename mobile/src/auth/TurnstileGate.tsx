import { Linking, StyleSheet } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { env } from '../env';

/**
 * Supabase requires a Cloudflare Turnstile token for sign-in. The widget runs
 * in a small web view whose base URL is the production site, so the token is
 * issued for the hostname the widget is configured to allow.
 */
const BASE_URL = 'https://bonamind.app';

/**
 * Turnstile runs its challenge in nested about:srcdoc / about:blank frames
 * (Cloudflare's WebView requirements list both). An https-only origin
 * whitelist refused about:srcdoc, so the widget said "Unable to connect to
 * website". Frames may load anything the challenge needs; the page itself
 * stays on the widget, and links it offers (Privacy, Help) open in the
 * browser. Android reports no isTopFrame and only asks about the top frame.
 */
export function allowTurnstileNavigation({ url, isTopFrame }: { url: string; isTopFrame?: boolean }): boolean {
  if (isTopFrame === false) return /^(https:|about:|blob:)/.test(url);
  if (url === 'about:blank' || url.startsWith(BASE_URL)) return true;
  if (url.startsWith('https://')) void Linking.openURL(url);
  return false;
}

function html(siteKey: string) {
  return [
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
    '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=boot&render=explicit" async defer></script>',
    '<style>html,body{margin:0;background:transparent;display:flex;justify-content:center;overflow:hidden}</style></head>',
    '<body><div id="t"></div><script>',
    'function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))}',
    // retry and refresh-expired are 'auto': Turnstile recovers by itself, the
    // app only tracks whether it currently holds a valid token.
    `function boot(){turnstile.render('#t',{sitekey:${JSON.stringify(siteKey)},theme:'dark',retry:'auto','refresh-expired':'auto',`,
    "callback:function(token){post({type:'token',token:token})},",
    "'error-callback':function(code){post({type:'error',code:String(code)})},",
    "'expired-callback':function(){post({type:'expired'})}})}",
    '</script></body></html>',
  ].join('\n');
}

export function TurnstileGate({ onToken, onExpire, onError }: { onToken(token: string): void; onExpire(): void; onError(): void }) {
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { type: string; token?: string };
      if (m.type === 'token' && m.token) onToken(m.token);
      else if (m.type === 'expired') onExpire();
      else onError();
    } catch {
      onError();
    }
  };
  return (
    <WebView
      source={{ html: html(env.turnstileSiteKey), baseUrl: BASE_URL }}
      onMessage={onMessage}
      style={styles.view}
      containerStyle={styles.view}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      // Every request is decided by allowTurnstileNavigation instead.
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={allowTurnstileNavigation}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
    />
  );
}

const styles = StyleSheet.create({ view: { height: 72, backgroundColor: 'transparent' } });
