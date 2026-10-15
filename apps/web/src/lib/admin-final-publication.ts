export type FinalPublicationUiResult = {
  committed: boolean;
  refreshProject: boolean;
  successMessage: string | null;
  errorMessage: string | null;
};

type PublicationPayload = {
  committed?: boolean | "unknown";
  message?: string;
  notification?: string;
  error?: string | { message?: string };
};

export function resolveFinalPublicationUi(
  responseOk: boolean,
  payload: PublicationPayload | null,
): FinalPublicationUiResult {
  if (payload?.committed === true) {
    return {
      committed: true,
      refreshProject: true,
      successMessage: "Final deliverables are live and available to the client.",
      errorMessage: payload.message ?? "Client notification was not sent. Retry only the notification after email delivery is restored.",
    };
  }

  if (payload?.committed === "unknown") {
    return {
      committed: false,
      refreshProject: true,
      successMessage: null,
      errorMessage: payload.message ?? "Publication outcome is unknown. Refresh and investigate before retrying.",
    };
  }

  if (responseOk) {
    return {
      committed: true,
      refreshProject: true,
      successMessage: "Final deliverables uploaded successfully. Client download is now ready.",
      errorMessage: null,
    };
  }

  const error = payload?.error;
  return {
    committed: false,
    refreshProject: false,
    successMessage: null,
    errorMessage: typeof error === "string" ? error : error?.message ?? "Failed to upload final files",
  };
}

export type FinalNotificationRetryUiResult = {
  successMessage: string | null;
  errorMessage: string | null;
  refreshProject: boolean;
};

export function resolveFinalNotificationRetryUi(
  status: number,
  responseOk: boolean,
  payload: PublicationPayload | null,
): FinalNotificationRetryUiResult {
  if (status === 409) {
    const error = payload?.error;
    const message = typeof error === "string" ? error : error?.message;
    return {
      successMessage: null,
      errorMessage: `${message ?? "Final publication changed before notification dispatch"}. Project state was refreshed; review the current final before retrying.`,
      refreshProject: true,
    };
  }

  if (payload?.committed === true) {
    return {
      successMessage: "Final deliverables are live and available to the client.",
      errorMessage: payload.message ?? null,
      refreshProject: true,
    };
  }

  if (responseOk) {
    return {
      successMessage: payload?.notification === "already_sent"
        ? "Final deliverables are live; the client notification was already sent."
        : "Final deliverables are live and the client notification was sent.",
      errorMessage: null,
      refreshProject: true,
    };
  }

  const error = payload?.error;
  return {
    successMessage: null,
    errorMessage: typeof error === "string" ? error : error?.message ?? payload?.message ?? "Client notification failed",
    refreshProject: true,
  };
}

export function shouldOfferFinalNotificationRetry(snapshot: {
  status?: string;
  finalZip?: { available?: boolean; assetId?: string | null };
} | null): boolean {
  return Boolean(
    snapshot?.finalZip?.available
    && snapshot.finalZip.assetId
    && (snapshot.status === "FINAL_FILES_READY" || snapshot.status === "DELIVERED"),
  );
}
