@php
    use App\Support\Mail\MailTheme as T;
    $c = fn (string $token) => T::colour($token);
@endphp
<div style="background:{{ $c('bg') }};padding:24px;font-family:Inter,Arial,sans-serif;color:{{ $c('fg') }};">
<div style="max-width:620px;margin:0 auto;background:{{ $c('surface') }};border:1px solid {{ $c('divider') }};border-radius:14px;overflow:hidden;">
<div style="padding:20px 24px;border-bottom:1px solid #f0ecff;background:#faf9ff;">
<img src="{{ T::logoUrl() }}" alt="Logo Fountain" style="height:34px;display:block;"/>
</div>
<div style="padding:28px 24px;">
<h1 style="margin:0 0 12px;font-size:{{ T::size('2xl') }};line-height:1.3;color:{{ $c('fg') }};">{{ $heading }}</h1>
<p style="margin:0 0 18px;font-size:{{ T::size('base') }};line-height:1.6;color:{{ $c('fg-2') }};">{{ $intro }}@if ($admin ?? false) Client: {{ $clientName }}. Brand: {{ $brandName }}.@endif</p>
<a href="{{ $ctaUrl }}" style="display:inline-block;background:{{ $c('accent') }};color:{{ $c('accent-fg') }} !important;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">{{ $ctaLabel }}</a>
<p style="margin:18px 0 0;font-size:{{ T::size('sm') }};line-height:1.5;color:{{ $c('fg-3') }};">{{ $footer }}</p>
</div>
</div>
</div>
