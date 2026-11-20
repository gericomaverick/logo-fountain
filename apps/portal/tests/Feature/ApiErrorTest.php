<?php

// Story 1.6 (X-03): domain exceptions render the legacy envelope {error:{message, code?, details?}}.

use App\Exceptions\ApiException;
use App\Support\ApiError;
use App\Support\ErrorCodes;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;

it('renders a thrown ApiException as the envelope with its status', function () {
    Route::get('/api/_test/missing', fn () => throw new ApiException('Project not found', 404, 'PROJECT_NOT_FOUND', ['nextStep' => 'Check the project link.']));

    $res = $this->get('/api/_test/missing');

    $res->assertStatus(404)->assertExactJson([
        'error' => ['message' => 'Project not found', 'code' => 'PROJECT_NOT_FOUND', 'details' => ['nextStep' => 'Check the project link.']],
    ]);
    expect($res->getContent())->toBe('{"error":{"message":"Project not found","code":"PROJECT_NOT_FOUND","details":{"nextStep":"Check the project link."}}}');
});

it('omits a missing code and missing details, as jsonError does', function () {
    expect(ApiError::body('Boom'))->toBe(['error' => ['message' => 'Boom']])
        ->and(ApiError::body('Boom', ''))->toBe(['error' => ['message' => 'Boom']])
        ->and(ApiError::response('Boom', 409, null, 'LIFECYCLE_CONFLICT')->getContent())
        ->toBe('{"error":{"message":"Boom","code":"LIFECYCLE_CONFLICT"}}');
});

it('keeps empty details a JSON object and does not escape slashes or unicode', function () {
    expect(ApiError::response('Send area=messages/concepts — é', 400, [], 'INVALID_AREA')->getContent())
        ->toBe('{"error":{"message":"Send area=messages/concepts — é","code":"INVALID_AREA","details":{}}}');
});

it('renders the envelope even for a page request (not only api/*)', function () {
    Route::get('/_test/forbidden', fn () => throw new ApiException('Forbidden', 403, ErrorCodes::FORBIDDEN, ['nextStep' => 'Use an admin account.']));

    $this->get('/_test/forbidden')->assertStatus(403)->assertJsonPath('error.code', 'FORBIDDEN');
});

it('does not log expected domain errors', function () {
    Log::spy();
    Route::get('/api/_test/unauthorized', fn () => throw new ApiException('Unauthorized', 401, ErrorCodes::UNAUTHORIZED));

    $this->get('/api/_test/unauthorized')->assertStatus(401);

    Log::shouldNotHaveReceived('error');
});
