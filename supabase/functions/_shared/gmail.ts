function base64url(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getGmailAccessToken(
  serviceAccountKey: { client_email: string; private_key: string },
  senderEmail: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountKey.client_email,
    sub: senderEmail,
    scope: "https://www.googleapis.com/auth/gmail.send",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64url(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const encodedPayload = base64url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signInput = `${encodedHeader}.${encodedPayload}`;

  // Import RSA private key
  const pemContents = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  const jwt = `${signInput}.${base64url(new Uint8Array(signature))}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Google token error: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

export interface GmailSendOptions {
  to: string[];
  subject: string;
  html: string;
  cc?: string[];
  replyTo?: string;
}

export async function sendGmail(
  senderEmail: string,
  options: GmailSendOptions
): Promise<{ success: boolean; messageId?: string }> {
  const saKeyJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!saKeyJson) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_KEY");
  }

  const serviceAccountKey = JSON.parse(saKeyJson);
  const accessToken = await getGmailAccessToken(serviceAccountKey, senderEmail);

  // Build RFC 2822 email
  const headers: string[] = [
    `From: DeltaNet FTTH <${senderEmail}>`,
    `To: ${options.to.join(", ")}`,
  ];

  if (options.cc && options.cc.length > 0) {
    headers.push(`Cc: ${options.cc.join(", ")}`);
  }
  if (options.replyTo) {
    headers.push(`Reply-To: ${options.replyTo}`);
  }

  // Encode subject as Base64 for UTF-8 support
  const subjectB64 = btoa(unescape(encodeURIComponent(options.subject)));
  headers.push(`Subject: =?UTF-8?B?${subjectB64}?=`);
  headers.push(`MIME-Version: 1.0`);
  headers.push(`Content-Type: text/html; charset=UTF-8`);
  headers.push(`Content-Transfer-Encoding: base64`);

  const htmlB64 = btoa(unescape(encodeURIComponent(options.html)));

  const rawEmail = headers.join("\r\n") + "\r\n\r\n" + htmlB64;

  // Gmail API expects base64url-encoded raw email
  const rawB64 = btoa(rawEmail)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${senderEmail}/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: rawB64 }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Gmail API error [${res.status}]: ${JSON.stringify(data)}`);
  }

  return { success: true, messageId: data.id };
}
