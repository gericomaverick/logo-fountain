<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Project;
use App\Models\ProjectOrder;
use App\Models\User;
use App\Policies\ProjectPolicy;
use App\Support\ErrorCodes;
use App\Support\Stripe\InvoiceResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Stripe\StripeClient;

/**
 * K-11 (API half): the three invoice lists (`api/invoices`, `api/projects/[id]/invoices`,
 * `api/admin/projects/[id]/invoices`), one shared item shape. One Stripe round trip per order, no cache (parity;
 * see RISKS). The routes sit behind `auth.verified` / `admin`.
 */
final class InvoiceController extends Controller
{
    /** Every order of every client the user belongs to, newest first (`invoices/route.ts:12-40`). */
    public function mine(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $orders = ProjectOrder::query()
            ->whereIn('client_id', fn ($q) => $q->select('client_id')->from('client_memberships')->where('user_id', $user->id))
            ->with(['project.briefs' => fn ($q) => $q->orderByDesc('version')])
            ->orderByDesc('created_at')->get();

        return response()->json(['invoices' => $this->items($orders, 'client', false)]);
    }

    /** Membership required: `participate`, so an admin who is not a member gets the 404 too. */
    public function project(Request $request, string $id): JsonResponse
    {
        $user = $this->user($request);
        $project = $this->find($id);
        if ($project === null || ! (new ProjectPolicy)->participate($user, $project)->allowed()) {
            throw new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
        }

        return response()->json(['invoices' => $this->items($this->orders($id), 'client', true)]);
    }

    /** Admin only (the `admin` middleware); the name carries the short project id. */
    public function admin(string $id): JsonResponse
    {
        return response()->json(['invoices' => $this->items($this->orders($id), 'admin', false)]);
    }

    /** @return Collection<int, ProjectOrder> */
    private function orders(string $projectId): Collection
    {
        if ($this->find($projectId) === null) {
            return new Collection;
        }

        return ProjectOrder::query()->where('project_id', $projectId)
            ->with(['project.briefs' => fn ($q) => $q->orderByDesc('version')])
            ->orderByDesc('created_at')->get();
    }

    private function find(string $id): ?Project
    {
        return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id) === 1 ? Project::query()->find($id) : null;
    }

    private function user(Request $request): User
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            throw new ApiException('Unauthorized', 401, ErrorCodes::UNAUTHORIZED, ['nextStep' => 'Sign in and retry.']);
        }

        return $user;
    }

    /**
     * @param  Collection<int, ProjectOrder>  $orders
     * @return list<array<string, mixed>>
     */
    private function items(Collection $orders, string $audience, bool $withLabel): array
    {
        $resolver = new InvoiceResolver(app(StripeClient::class));
        $items = [];
        foreach ($orders as $order) {
            $settled = $order->status === 'FULFILLED';
            $doc = $resolver->resolve($order->stripe_checkout_session_id, $order->stripe_payment_intent_id, $settled);
            $brief = $order->project?->briefs->first();
            $answers = $brief?->answers;
            $brand = is_object($answers) && isset($answers->brandName) && is_string($answers->brandName) ? trim($answers->brandName) : '';
            $short = substr($order->project_id, 0, 8);
            $name = $brand !== '' ? ($audience === 'admin' ? "$brand · #$short" : $brand) : ($audience === 'admin' ? "Project #$short" : 'Your logo project');

            $item = [
                'id' => $order->id, 'projectId' => $order->project_id, 'projectName' => $name,
                'amountCents' => $order->total_cents, 'currency' => $order->currency,
                'status' => $settled ? 'Paid' : $order->status,
                'date' => $order->created_at?->utc()->format('Y-m-d\TH:i:s.v\Z'),
                'invoiceId' => $doc->invoiceId, 'invoicePdfUrl' => $doc->invoicePdfUrl, 'hostedInvoiceUrl' => $doc->hostedInvoiceUrl,
                'receiptUrl' => $doc->receiptUrl, 'documentType' => $doc->source,
            ] + ($withLabel ? ['documentLabel' => $doc->source === 'receipt' ? 'Payment receipt (paid-safe)' : 'Invoice'] : [])
                + ['downloadUrl' => $doc->downloadUrl()];
            $items[] = $item;
        }

        return $items;
    }
}
