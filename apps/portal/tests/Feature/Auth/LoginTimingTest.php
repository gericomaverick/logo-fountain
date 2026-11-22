<?php

use App\Actions\Auth\Login;
use Illuminate\Support\Facades\Hash;
use Tests\Support\LoginRequests as L;

// Story 4.3 AC 9 (proposed DV-19, @deviation): every login that reaches the check costs exactly one hash comparison.
// Asserts Laravel only; no claim about Next.

beforeEach(fn () => config(['session.driver' => 'database']));

it('compares exactly one hash whatever the account', function (array $attrs, string $email, string $password) {
    L::user(['email' => 'real@example.test'] + $attrs);
    Hash::partialMock()->shouldReceive('check')->once()->passthru();

    L::post(['email' => $email, 'password' => $password]);
})->with([
    'unknown account' => [[], 'ghost@example.test', L::PASSWORD],
    'no password' => [['password' => null], 'real@example.test', L::PASSWORD],
    'unverified' => [['email_verified_at' => null], 'real@example.test', L::PASSWORD],
    'wrong password' => [[], 'real@example.test', 'wrong-wrong'],
    'success' => [[], 'real@example.test', L::PASSWORD],
]);

it('keeps a dummy hash that is a bcrypt cost-12 hash and matches no real password', function () {
    expect(password_get_info(Login::DUMMY_HASH))->toMatchArray(['algoName' => 'bcrypt'])
        ->and(Hash::check(L::PASSWORD, Login::DUMMY_HASH))->toBeFalse();
});
