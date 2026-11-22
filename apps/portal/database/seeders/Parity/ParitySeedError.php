<?php

namespace Database\Seeders\Parity;

use RuntimeException;

/** Story 2.6: a refusal or a bad scenario. Raised before any write; `parity:seed` prints the message and exits 1. */
final class ParitySeedError extends RuntimeException {}
