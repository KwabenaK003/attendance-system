// src/lib/emailTest.ts
//
// Frontend helper that calls the send-test-email Supabase Edge Function.
// Use this from your SettingsPage "Send Test Email" button.

import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { EmailSettings } from "./systemSettings";

export interface SendTestEmailResult {
  success: boolean;
  message: string;
}

/**
 * Sends a test email using the currently configured SMTP settings.
 * Throws an Error with a user-readable message on failure.
 */
export async function sendTestEmail(
  emailSettings: EmailSettings,
  toAddress: string
): Promise<SendTestEmailResult> {
  if (!toAddress?.trim()) {
    throw new Error("Enter an email address to send the test to.");
  }

  const { smtpHost, smtpPort, smtpUsername, smtpPassword, fromName, replyToAddress } = emailSettings;

  if (!smtpHost || !smtpPort || !smtpUsername || !smtpPassword) {
    throw new Error("Fill in SMTP Host, Port, Username, and Password before testing.");
  }

  let data: { success?: boolean; message?: string; error?: string } | null = null;
  let error: unknown = null;

  try {
    const response = await supabase.functions.invoke("send-test-email", {
      body: {
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpUsername,
        smtpPassword,
        fromName,
        replyToAddress,
        toAddress: toAddress.trim(),
      },
    });

    data = response.data;
    error = response.error;
  } catch (invokeError) {
    error = invokeError;
  }

  if (error) {
    let backendMessage = "";
    if (error instanceof FunctionsHttpError || error instanceof FunctionsRelayError) {
      const context = error.context as Response | undefined;
      if (context) {
        try {
          const payload = await context.clone().json() as { error?: string; message?: string } | null;
          backendMessage = payload?.error || payload?.message || "";
        } catch {
          // Fall back to the generic error below.
        }
      }
    }

    if (backendMessage) {
      throw new Error(backendMessage);
    }

    if (error instanceof FunctionsFetchError) {
      throw new Error(
        "The test email function could not be reached from the network. Check that the Edge Function is deployed and your Supabase project is online."
      );
    }

    const message = error instanceof Error ? error.message : String(error);

    if (/Failed to send a request to the Edge Function/i.test(message)) {
      throw new Error(
        "The test email function is not reachable yet. Make sure the Supabase Edge Function `send-test-email` is deployed in your linked project, then try again."
      );
    }

    throw new Error(message || "Failed to reach the email function.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return { success: true, message: data?.message || "Test email sent successfully." };
}
