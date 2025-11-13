import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

type EventPayload = {
  eventType: string;
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
  orgId?: string | null;
  privacyLevel?: 'standard' | 'minimal' | 'none';
};

let activeSessionId: string | null = null;

export async function startAnalyticsSession(userId?: string | null) {
  try {
    const sessionUserId = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!sessionUserId) return { error: null };

    const platform = Platform.OS;
    const appVersion =
      (Constants.manifest2?.extra as any)?.expoClient?.version ??
      Constants.expoConfig?.version ??
      undefined;
    const locale = (Intl.DateTimeFormat().resolvedOptions().locale ?? '').toString() || undefined;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? undefined;

    const { data, error } = await supabase
      .from('analytics_sessions')
      .insert({
        user_id: sessionUserId,
        device: undefined,
        platform,
        app_version: appVersion,
        locale,
        timezone,
        metadata: {},
      })
      .select('id')
      .single();

    if (!error && data?.id) {
      activeSessionId = data.id as string;
    }
    return { error: error ?? null, sessionId: activeSessionId };
  } catch (e) {
    return { error: e as Error, sessionId: activeSessionId };
  }
}

export async function trackEvent(payload: EventPayload) {
  try {
    const { eventType, properties, context, orgId, privacyLevel } = payload;
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!userId) return { error: null };

    const { error } = await supabase.from('analytics_events').insert({
      user_id: userId,
      session_id: activeSessionId,
      org_id: orgId ?? null,
      event_type: eventType,
      source: 'app',
      privacy_level: privacyLevel ?? 'standard',
      properties: properties ?? {},
      context: context ?? {},
    });

    // Best-effort: update last_event_at
    if (!error && activeSessionId) {
      await supabase
        .from('analytics_sessions')
        .update({ last_event_at: new Date().toISOString() })
        .eq('id', activeSessionId);
    }

    return { error: error ?? null };
  } catch (e) {
    return { error: e as Error };
  }
}

export function getActiveSessionId() {
  return activeSessionId;
}


