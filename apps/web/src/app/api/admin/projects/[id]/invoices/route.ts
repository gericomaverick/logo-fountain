import { prisma } from "@/lib/prisma";
import { extractBrandNameFromBriefAnswers, getProjectDisplayTitle } from "@/lib/project-display-name";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { resolveStripeInvoiceDocument } from "@/lib/client-invoices";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id } = await params;

    const orders = await prisma.projectOrder.findMany({
      where: { projectId: id },
      select: {
        id: true,
        projectId: true,
        status: true,
        currency: true,
        totalCents: true,
        createdAt: true,
        stripeCheckoutSessionId: true,
        stripePaymentIntentId: true,
        project: {
          select: {
            briefs: {
              orderBy: { version: "desc" },
              take: 1,
              select: { answers: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const invoices = await Promise.all(
      orders.map(async (order) => {
        const doc = await resolveStripeInvoiceDocument({
          stripeCheckoutSessionId: order.stripeCheckoutSessionId,
          stripePaymentIntentId: order.stripePaymentIntentId,
        });

        const brandName = extractBrandNameFromBriefAnswers(order.project.briefs[0]?.answers);
        return {
          id: order.id,
          projectId: order.projectId,
          projectName: getProjectDisplayTitle({ projectId: order.projectId, brandName, audience: "admin" }),
          amountCents: order.totalCents,
          currency: order.currency,
          status: order.status,
          date: order.createdAt.toISOString(),
          invoiceId: doc.invoiceId,
          invoicePdfUrl: doc.invoicePdfUrl,
          hostedInvoiceUrl: doc.hostedInvoiceUrl,
          receiptUrl: doc.receiptUrl,
          documentType: doc.source,
          downloadUrl: doc.invoicePdfUrl ?? doc.hostedInvoiceUrl ?? doc.receiptUrl,
        };
      }),
    );

    return Response.json({ invoices });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
