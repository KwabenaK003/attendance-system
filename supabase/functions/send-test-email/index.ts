// supabase/functions/send-test-email/index.ts
//
// Sends a single test email using the SMTP settings passed from the
// Settings page. Deploy with:
//   supabase functions deploy send-test-email
//
// Call from the frontend with supabase.functions.invoke("send-test-email", { body: {...} })
//
// This implementation avoids a large third-party SMTP dependency so the
// function can be deployed more reliably in constrained environments.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestEmailPayload {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  fromName?: string;
  replyToAddress?: string;
  toAddress: string;
  senderAddress?: string;
}

type SmtpConnection = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): void;
};

type SmtpResponse = {
  code: number;
  message: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function extractEmailAddress(value: string | undefined | null): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  const angleMatch = trimmed.match(/<([^<>]+)>/);
  const candidate = (angleMatch?.[1] ?? trimmed).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: TestEmailPayload = await req.json();

    const {
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
      fromName,
      replyToAddress,
      toAddress,
    } = payload;

    const trimmedSmtpHost = smtpHost?.trim();
    const trimmedSmtpUsername = smtpUsername?.trim();
    const trimmedSmtpPassword = smtpPassword?.trim();
    const trimmedFromName = fromName?.trim();
    const trimmedReplyToAddress = replyToAddress?.trim();
    const trimmedToAddress = toAddress?.trim();

    if (!trimmedSmtpHost || !smtpPort || !trimmedSmtpUsername || !trimmedSmtpPassword || !trimmedToAddress) {
      return new Response(
        JSON.stringify({ error: "Missing required SMTP fields or recipient address." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const senderAddress =
      extractEmailAddress(trimmedReplyToAddress) ||
      extractEmailAddress(trimmedSmtpUsername);

    if (!senderAddress) {
      return new Response(
        JSON.stringify({
          error: "SMTP Username or Reply-To Address must contain a valid email address for the sender.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await sendTestEmail({
      smtpHost: trimmedSmtpHost,
      smtpPort: Number(smtpPort),
      smtpUsername: trimmedSmtpUsername,
      smtpPassword: trimmedSmtpPassword,
      fromName: trimmedFromName,
      replyToAddress: trimmedReplyToAddress,
      toAddress: trimmedToAddress,
      senderAddress,
    });

    return new Response(
      JSON.stringify({ success: true, message: `Test email sent to ${toAddress}.` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error sending test email.";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sendTestEmail({
  smtpHost,
  smtpPort,
  smtpUsername,
  smtpPassword,
  fromName,
  replyToAddress,
  toAddress,
  senderAddress,
}: TestEmailPayload): Promise<void> {
  let conn = await connectSmtp(smtpHost, smtpPort);
  let writer = conn.writable.getWriter();
  let reader = conn.readable.getReader();
  const state = { buffer: "" };

  try {
    await expectCode(await readResponse(reader, state), 220, "SMTP server did not greet properly");

    let response = await sendCommand(writer, reader, state, `EHLO localhost`);
    if (response.code !== 250) {
      response = await sendCommand(writer, reader, state, `HELO localhost`);
      await expectCode(response, 250, "SMTP server rejected EHLO/HELO");
    }

    const supportsStartTls = /STARTTLS/i.test(response.message);
    if (supportsStartTls && smtpPort !== 465) {
      response = await sendCommand(writer, reader, state, `STARTTLS`);
      await expectCode(response, 220, "SMTP server refused STARTTLS");

      writer.releaseLock();
      reader.releaseLock();
      conn = await upgradeToTls(conn, smtpHost);
      writer = conn.writable.getWriter();
      reader = conn.readable.getReader();
      state.buffer = "";

      response = await sendCommand(writer, reader, state, `EHLO localhost`);
      if (response.code !== 250) {
        response = await sendCommand(writer, reader, state, `HELO localhost`);
        await expectCode(response, 250, "SMTP server rejected EHLO/HELO after STARTTLS");
      }
    }

    await authenticate(writer, reader, state, smtpUsername, smtpPassword);
    await sendMessage(writer, reader, state, senderAddress, fromName, replyToAddress, toAddress);

    await sendCommand(writer, reader, state, `QUIT`);
  } finally {
    writer.releaseLock();
    reader.releaseLock();
    conn.close();
  }
}

async function connectSmtp(hostname: string, port: number): Promise<SmtpConnection> {
  if (port === 465) {
    return Deno.connectTLS({ hostname, port });
  }

  return Deno.connect({ hostname, port });
}

async function upgradeToTls(connection: SmtpConnection, hostname: string): Promise<SmtpConnection> {
  if (typeof Deno.startTls !== "function") {
    throw new Error("This runtime does not support STARTTLS.");
  }

  return Deno.startTls(connection, { hostname });
}

async function authenticate(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: { buffer: string },
  username: string,
  password: string
): Promise<void> {
  let response = await sendCommand(writer, reader, state, `AUTH PLAIN ${encodeBase64(`\0${username}\0${password}`)}`);
  if (response.code === 235) {
    return;
  }

  if (![235, 334, 503].includes(response.code)) {
    response = await sendCommand(writer, reader, state, `AUTH LOGIN`);
  }

  if (response.code === 235) {
    return;
  }

  if (response.code !== 334) {
    throw new Error(`SMTP authentication failed: ${response.message}`);
  }

  response = await sendCommand(writer, reader, state, encodeBase64(username));
  if (response.code !== 334) {
    if (response.code === 235) return;
    throw new Error(`SMTP authentication failed: ${response.message}`);
  }

  response = await sendCommand(writer, reader, state, encodeBase64(password));
  await expectCode(response, 235, `SMTP authentication failed: ${response.message}`);
}

async function sendMessage(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: { buffer: string },
  senderAddress: string,
  fromName: string | undefined,
  replyToAddress: string | undefined,
  toAddress: string
): Promise<void> {
  await expectCode(await sendCommand(writer, reader, state, `MAIL FROM:<${senderAddress}>`), 250, "SMTP rejected sender address");
  await expectCode(await sendCommand(writer, reader, state, `RCPT TO:<${toAddress}>`), 250, "SMTP rejected recipient address");
  await expectCode(await sendCommand(writer, reader, state, `DATA`), 354, "SMTP server did not accept the message body");

  const headers = [
    `From: ${fromName || "Attendance Management"} <${senderAddress}>`,
    `To: <${toAddress}>`,
    `Reply-To: ${replyToAddress || senderAddress}`,
    `Subject: Test Email - SMTP Configuration Verified`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">`,
    `  <h2 style="color:#111;">SMTP connection successful</h2>`,
    `  <p style="color:#444; font-size: 14px;">`,
    `    This is a test email from your Attendance Management system.`,
    `    If you're reading this, your SMTP configuration is working correctly.`,
    `  </p>`,
    `</div>`,
  ].join("\r\n");

  await writeLine(writer, headers + "\r\n.");
  await expectCode(await readResponse(reader, state), 250, "SMTP server did not accept the message");
}

async function sendCommand(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: { buffer: string },
  command: string
): Promise<SmtpResponse> {
  await writeLine(writer, command);
  return readResponse(reader, state);
}

async function writeLine(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  value: string
): Promise<void> {
  await writer.write(encoder.encode(`${value}\r\n`));
}

async function readResponse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: { buffer: string }
): Promise<SmtpResponse> {
  const lines: string[] = [];
  let code = 0;
  let more = true;

  while (more) {
    const line = await readLine(reader, state);
    lines.push(line);
    const match = line.match(/^(\d{3})([\s-])(.*)$/);
    if (match) {
      code = Number(match[1]);
      more = match[2] === "-";
    } else {
      more = false;
    }
  }

  return { code, message: lines.join("\n") };
}

async function readLine(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: { buffer: string }
): Promise<string> {
  while (true) {
    const newlineIndex = state.buffer.indexOf("\n");
    if (newlineIndex >= 0) {
      const line = state.buffer.slice(0, newlineIndex).replace(/\r$/, "");
      state.buffer = state.buffer.slice(newlineIndex + 1);
      return line;
    }

    const { value, done } = await reader.read();
    if (done) {
      if (state.buffer.length > 0) {
        const line = state.buffer.replace(/\r$/, "");
        state.buffer = "";
        return line;
      }
      throw new Error("SMTP connection closed unexpectedly.");
    }

    state.buffer += decoder.decode(value, { stream: true });
  }
}

function encodeBase64(value: string): string {
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function expectCode(response: SmtpResponse, expected: number, message: string): Promise<SmtpResponse> {
  if (response.code !== expected) {
    throw new Error(`${message}: ${response.message}`);
  }

  return response;
}
