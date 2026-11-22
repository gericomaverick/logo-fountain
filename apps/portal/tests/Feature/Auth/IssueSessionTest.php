<?php

use App\Models\User;
use App\Support\Auth\IssueSession;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

// Story 4.1 AC 9 (A-04): IssueSession regenerates the id and stamps auth.issued_at once.

it('kills the old id and the new row carries issued_at and the user', function () {
    config(['session.driver' => 'database']);
    Carbon::setTestNow('2026-11-22 12:00:00');
    $user = User::factory()->create();
    $seen = [];
    Route::get('/api/_test/pre', function (Request $r) use (&$seen) {
        $r->session()->put('anon', 1);
        $seen['old'] = $r->session()->getId();

        return 'ok';
    })->middleware('web');
    Route::get('/api/_test/login', function (Request $r) use ($user, &$seen) {
        (new IssueSession)($user, $r->session());
        $seen['new'] = $r->session()->getId();

        return 'ok';
    })->middleware('web');

    $this->get('/api/_test/pre');
    expect(DB::table('sessions')->where('id', $seen['old'])->exists())->toBeTrue();

    $this->withCookie(config('session.cookie'), $seen['old'])->get('/api/_test/login');
    expect($seen['new'])->not->toBe($seen['old'])
        ->and(DB::table('sessions')->where('id', $seen['old'])->exists())->toBeFalse();

    $row = DB::table('sessions')->where('id', $seen['new'])->first();
    $payload = json_decode((string) base64_decode($row->payload), true);
    expect($row->user_id)->toBe($user->id)
        ->and($payload['auth'])->toBe(['user_id' => $user->id, 'issued_at' => Carbon::now()->getTimestamp()]);
    Carbon::setTestNow();
});
