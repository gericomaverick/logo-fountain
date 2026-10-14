export type FinalPublicationUiResult = {
  committed: boolean;
  retryNotification: boolean;
  successMessage: string | null;
  errorMessage: string | null;
};

type PublicationPayload = {
  committed?: boolean;
  message?: string;
  error?: string | { message?: string };
};

export function resolveFinalPublicationUi(
  responseOk: boolean,
  payload: PublicationPayload | null,
): FinalPublicationUiResult {
  if (payload?.committed) {
    return {
      committed: true,
      retryNotification: true,
      successMessage: "Final deliverables are live and available to the client.",
      errorMessage: payload.message ?? "Client notification was not sent. Retry only the notification after email delivery is restored.",
    };
  }

  if (responseOk) {
    return {
      committed: true,
      retryNotification: false,
      successMessage: "Final deliverables uploaded successfully. Client download is now ready.",
      errorMessage: null,
    };
  }

  const error = payload?.error;
  return {
    committed: false,
    retryNotification: false,
    successMessage: null,
    errorMessage: typeof error === "string" ? error : error?.message ?? "Failed to upload final files",
  };
}
