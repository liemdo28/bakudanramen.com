<?php
defined('ABSPATH') || exit;

function bkdn_svg(string $key): string {
    $a = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"';
    $s = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

    switch ($key) {

        case 'order':
            return "<svg $a $s>
              <path d=\"M4 11h16\"/>
              <path d=\"M5 11a7 7 0 0014 0\"/>
              <line x1=\"9.5\" y1=\"4\" x2=\"11\" y2=\"11\"/>
              <line x1=\"14.5\" y1=\"4\" x2=\"13\" y2=\"11\"/>
            </svg>";

        case 'website':
            return "<svg $a $s>
              <circle cx=\"12\" cy=\"12\" r=\"9\"/>
              <path d=\"M12 3a15 15 0 010 18M12 3a15 15 0 000 18\"/>
              <line x1=\"3\" y1=\"12\" x2=\"21\" y2=\"12\"/>
            </svg>";

        case 'email':
            return "<svg $a $s>
              <rect x=\"3\" y=\"6\" width=\"18\" height=\"13\" rx=\"2\"/>
              <path d=\"M3 6l9 7 9-7\"/>
            </svg>";

        case 'events':
            return "<svg $a fill=\"currentColor\" stroke=\"none\">
              <path d=\"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z\"/>
            </svg>";

        case 'instagram':
            return "<svg $a $s>
              <rect x=\"2\" y=\"2\" width=\"20\" height=\"20\" rx=\"5\"/>
              <circle cx=\"12\" cy=\"12\" r=\"5\"/>
              <circle cx=\"17.5\" cy=\"6.5\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/>
            </svg>";

        case 'facebook':
            return "<svg $a fill=\"currentColor\" stroke=\"none\">
              <rect x=\"2\" y=\"2\" width=\"20\" height=\"20\" rx=\"5\"/>
              <path d=\"M15.5 8h-2c-.6 0-.5.5-.5 1v1.5h2.5l-.5 2.5H13V19h-2.5v-6H9v-2.5h1.5V9c0-2 1.1-3 3-3H15.5V8z\" fill=\"#0a0a0a\"/>
            </svg>";

        case 'directions':
            return "<svg $a $s>
              <path d=\"M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z\"/>
              <circle cx=\"12\" cy=\"9\" r=\"2.5\"/>
            </svg>";

        case 'phone':
            return "<svg $a $s>
              <path d=\"M22 16.92v3a2 2 0 01-2.18 2A19.8 19.8 0 013.1 4.18 2 2 0 015.09 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L9.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z\"/>
            </svg>";

        case 'menu':
            return "<svg $a $s>
              <path d=\"M3 6h18M3 12h18M3 18h18\"/>
            </svg>";

        case 'gift':
            return "<svg $a $s>
              <polyline points=\"20 12 20 22 4 22 4 12\"/>
              <rect x=\"2\" y=\"7\" width=\"20\" height=\"5\"/>
              <line x1=\"12\" y1=\"22\" x2=\"12\" y2=\"7\"/>
              <path d=\"M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z\"/>
              <path d=\"M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z\"/>
            </svg>";

        case 'ticket':
            return "<svg $a $s>
              <path d=\"M2 9a3 3 0 010 6v2a2 2 0 002 2h16a2 2 0 002-2v-2a3 3 0 010-6V7a2 2 0 00-2-2H4a2 2 0 00-2 2v2z\"/>
              <line x1=\"9\" y1=\"12\" x2=\"15\" y2=\"12\"/>
            </svg>";

        case 'external':
            return "<svg $a $s>
              <path d=\"M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6\"/>
              <polyline points=\"15 3 21 3 21 9\"/>
              <line x1=\"10\" y1=\"14\" x2=\"21\" y2=\"3\"/>
            </svg>";

        default:
            return "<svg $a $s><circle cx=\"12\" cy=\"12\" r=\"9\"/></svg>";
    }
}
