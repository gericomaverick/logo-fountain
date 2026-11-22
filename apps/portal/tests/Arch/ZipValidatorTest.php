<?php

// Story 3.3 AC 6: ZipArchive and the zip_* functions are reachable (the Dockerfile installs ext-zip) and so forbidden:
// the validator is a byte-for-byte port, and an extractor would accept archives it rejects.
arch('nothing in app uses ZipArchive or the zip_* functions')
    ->expect('App')
    ->not->toUse(['ZipArchive', 'zip_open', 'zip_read', 'zip_close', 'zip_entry_open', 'zip_entry_read']);
