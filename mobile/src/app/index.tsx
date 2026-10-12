import { Redirect } from 'expo-router';
import { useAuth } from '../data/auth';

// Pick the target by auth: a redirect into a screen Stack.Protected refuses is
// dropped, which would strand a signed-out launch on this empty route.
export default function Index() {
  const { status } = useAuth();
  return <Redirect href={status === 'signed-in' ? '/today' : '/welcome'} />;
}
