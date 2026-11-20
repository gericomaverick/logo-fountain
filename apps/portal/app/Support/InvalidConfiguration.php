<?php

namespace App\Support;

use RuntimeException;

/** A production configuration the portal refuses to run with (FR57). Messages never carry secrets. */
final class InvalidConfiguration extends RuntimeException {}
