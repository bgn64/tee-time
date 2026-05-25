import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { useSystem } from '@/library/powersync/system';
import { showAlert } from '@/library/utils/alert';

interface SignInGateProps {
  children: React.ReactNode;
}

/**
 * Renders children only when a Supabase session is active.
 * Otherwise renders an inline email/password sign-in form.
 */
export function SignInGate({ children }: SignInGateProps) {
  const system = useSystem();
  const [session, setSession] = React.useState<Session | null>(null);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session: initialSession }
      } = await system.supabaseConnector.client.auth.getSession();
      if (!cancelled) {
        setSession(initialSession);
        setChecking(false);
      }
    })();

    const {
      data: { subscription }
    } = system.supabaseConnector.client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [system]);

  if (checking) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <SignInForm />;
  }

  return <>{children}</>;
}

function SignInForm() {
  const system = useSystem();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      showAlert('Missing details', 'Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await system.supabaseConnector.login(email.trim(), password);
    } catch (err: any) {
      showAlert('Sign in failed', err?.message ?? 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.heading}>Sign in</Text>
        <Text style={styles.subheading}>
          Sign in with the Supabase user you created in the dashboard.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          editable={!submitting}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
          onSubmitEditing={handleSubmit}
        />
        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}>
          {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  container: {
    flex: 1,
    backgroundColor: '#f7f7f8',
    padding: 24,
    justifyContent: 'center'
  },
  form: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111'
  },
  subheading: {
    color: '#666',
    fontSize: 14,
    marginBottom: 4
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff'
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16
  }
});
