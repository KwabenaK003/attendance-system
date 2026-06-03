type NavigatorConnection = {
  type?: string;
  effectiveType?: string;
};

type NavigatorWithMetadata = Navigator & {
  userAgentData?: { platform?: string };
  connection?: NavigatorConnection;
  mozConnection?: NavigatorConnection;
  webkitConnection?: NavigatorConnection;
};

function inferBrowser(userAgent?: string) {
  if (!userAgent) return "Unknown Browser";
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return "Safari";
  return "Unknown Browser";
}

function inferOs(userAgent?: string, platform?: string) {
  const source = `${userAgent} ${platform}`.trim();

  if (/Windows/i.test(source)) return "Windows";
  if (/Android/i.test(source)) return "Android";
  if (/iPhone|iPad|iPod/i.test(source)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(source)) return "macOS";
  if (/Linux/i.test(source)) return "Linux";

  return "Unknown OS";
}

function inferDeviceType(userAgent: string) {
  if (/iPad|Tablet|Silk/i.test(userAgent)) return "Tablet";
  if (/Mobile|Android|iPhone|iPod/i.test(userAgent)) return "Mobile";
  return "Desktop";
}

export function getDeviceMetadata() {
  if (typeof navigator === "undefined") {
    return {
      deviceName: "Unknown Device",
      browser: "Unknown Browser",
      os: "Unknown OS",
      deviceType: "Unknown Device Type",
      userAgent: "",
    };
  }

  const metadataNavigator = navigator as NavigatorWithMetadata;
  const userAgent = metadataNavigator.userAgent || "";
  const platform = metadataNavigator.userAgentData?.platform || metadataNavigator.platform || "";
  const browser = inferBrowser(userAgent);
  const os = inferOs(userAgent, platform);
  const deviceType = inferDeviceType(userAgent);

  return {
    deviceName: `${deviceType} • ${browser} on ${os}`,
    browser,
    os,
    deviceType,
    userAgent,
  };
}

export function getNetworkMetadata() {
  if (typeof navigator === "undefined") {
    return {
      networkName: "Unknown Network",
      connectionType: "unknown",
      effectiveType: "",
    };
  }

  const metadataNavigator = navigator as NavigatorWithMetadata;
  const connection = metadataNavigator.connection || metadataNavigator.mozConnection || metadataNavigator.webkitConnection;
  const connectionType = connection?.type || "unknown";
  const effectiveType = connection?.effectiveType || "";

  let networkName = "Unknown Network";

  if (connectionType === "wifi") {
    networkName = "Wi-Fi";
  } else if (connectionType === "ethernet") {
    networkName = "Ethernet";
  } else if (connectionType === "cellular") {
    networkName = effectiveType ? `Cellular (${effectiveType.toUpperCase()})` : "Cellular";
  } else if (connectionType === "bluetooth") {
    networkName = "Bluetooth Network";
  } else if (connectionType === "wimax") {
    networkName = "WiMAX";
  } else if (effectiveType) {
    networkName = `Network (${effectiveType.toUpperCase()})`;
  }

  return {
    networkName,
    connectionType,
    effectiveType,
  };
}

export async function getPublicIpAddress(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("https://api64.ipify.org?format=json", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error("Unable to resolve IP address");
    }

    const data = await response.json();
    return typeof data?.ip === "string" ? data.ip : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}
