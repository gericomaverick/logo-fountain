export type FinalPublicationUiResult = {
  committed: boolean;
  refreshProject: boolean;
  successMessage: string | null;
  errorMessage: string | null;
};

type PublicationPayload = {
  committed?: boolean | "unknown";
  message?: string;
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
