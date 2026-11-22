<div style="background:#f8f7ff;padding:24px;font-family:Inter,Arial,sans-serif;color:#1d1330;">
<div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #ebe7ff;border-radius:14px;overflow:hidden;">
<div style="padding:28px 24px;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#1d1330;">{{ $heading }}</h1>
<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#43355f;">{{ $intro }}@if ($admin) Client: {{ $clientName }}. Brand: {{ $brandName }}.@endif</p>
<a href="{{ $ctaUrl }}" style="display:inline-block;background:#5b38f0;color:#ffffff !important;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">{{ $ctaLabel }}</a>
<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#6f6590;">{{ $footer }}</p>
</div>
</div>
</div>
