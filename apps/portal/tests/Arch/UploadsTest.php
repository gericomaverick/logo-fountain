<?php

// Story 3.2 (open question 3, built as recommended): the upload validators never decode. A decoder accepts files the
// byte-for-byte port of Next's validators rejects, so no image library may creep into app/Support/Uploads.
// (Story 3.3 adds ZipArchive to this list.)
arch('the upload validators use no image decoder')
    ->expect('App\Support\Uploads')
    ->not->toUse(['getimagesize', 'getimagesizefromstring', 'imagecreatefromstring', 'imagecreatefrompng', 'imagecreatefromjpeg', 'imagecreatefromwebp', 'Imagick', 'GdImage']);
