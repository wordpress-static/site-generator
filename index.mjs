import fs from 'fs';
import path from 'path';
import express from 'express';
import { rootCertificates } from 'tls';
import { loadNodeRuntime } from '@php-wasm/node';
import { resolveWordPressRelease, bootWordPress } from '@wp-playground/wordpress';
import {
	resetData,
    setSiteOptions,
    writeFile
} from '@wp-playground/blueprints';
import importStatic from './importStatic.mjs';
import { spawn } from 'child_process';
import './register-blocks.js';

const bufferRequestBody = async (req) =>
	await new Promise((resolve) => {
		const body = [];
		req.on('data', (chunk) => {
			body.push(chunk);
		});
		req.on('end', () => {
			resolve(Buffer.concat(body));
		});
	});

const parseHeaders = (req) => {
	const requestHeaders = {};
	if (req.rawHeaders && req.rawHeaders.length) {
		for (let i = 0; i < req.rawHeaders.length; i += 2) {
			requestHeaders[req.rawHeaders[i].toLowerCase()] =
				req.rawHeaders[i + 1];
		}
	}
	return requestHeaders;
};

const args = {
    port: 9400,
    wp: '6.7',
};

async function run() {
console.log(`Setting up WordPress ${args.wp}...`);
const wpDetails = await resolveWordPressRelease(args.wp);
console.log(`Downloading ${wpDetails.releaseUrl}`);
const wordPressZip = await fetch(wpDetails.releaseUrl);
console.log('Downloading SQLite...');
const sqliteZip = await fetch(
    'https://github.com/WordPress/sqlite-database-integration/archive/refs/heads/main.zip'
);
console.log('Booting WordPress...');
const requestHandler = await bootWordPress({
    siteUrl: `http://127.0.0.1:${args.port}`,
    createPhpRuntime: async () =>
        await loadNodeRuntime(undefined),
    wordPressZip: new File(
        [ await wordPressZip.arrayBuffer() ],
        'wp.zip',
        { type: 'application/zip' }
    ),
    sqliteIntegrationPluginZip: new File(
        [ await sqliteZip.arrayBuffer() ],
        'sqlite.zip',
        { type: 'application/zip' }
    ),
    sapiName: 'cli',
    createFiles: {
        '/internal/shared/ca-bundle.crt': rootCertificates.join('\n'),
    },
    constants: {
        WP_DEBUG: true,
        WP_DEBUG_LOG: true,
        WP_DEBUG_DISPLAY: false,
    },
    phpIniEntries: {
        'openssl.cafile': '/internal/shared/ca-bundle.crt',
        allow_url_fopen: '1',
        disable_functions: '',
    },
});
console.log(`Booted! Importing content...`);

const { php, reap } = await requestHandler.processManager.acquirePHPInstance();

await resetData(php);
await setSiteOptions(php, {
    options: {
        blogname: 'My Blog',
        blogdescription: 'A great blog'
    }
});
await writeFile(php, {
    path: '/wordpress/wp-content/mu-plugins/mu.php',
    data: `<?php
add_filter('comments_open', '__return_false');
add_filter('pings_open', '__return_false');
add_filter('feed_links_show_comments_feed', '__return_false');
remove_action('wp_head', 'rsd_link');
remove_action('wp_head', 'rest_output_link_wp_head');
remove_action('wp_head', 'wp_oembed_add_discovery_links');
remove_action('wp_head', 'wp_shortlink_wp_head');
`
});

await importStatic(php);

console.log('Starting server...');

const app = express();

app.listen(args.port, () => {
    console.log('Generating static files...');
    const wget = spawn('wget', [
        '--mirror',
        '--convert-links',
        '--adjust-extension',
        '--page-requisites',
        '--exclude-directories=wp-admin,wp-json',
        '--reject=wp-login.php',
        '--directory-prefix=dist',
        '--no-host-directories',
        `http://127.0.0.1:${args.port}`
    ]);
    wget.stdout.on('data', ( data ) => console.log(data.toString()));
    wget.stderr.on('data', ( data ) => console.error(data.toString()));
    wget.on('close', () => {
        console.log('Making links pretty...');
        function makePretty(filePath) {
            const files = fs.readdirSync(filePath);
            for (const file of files) {
                const _path = path.join(filePath, file);
                const stat = fs.statSync(_path);
                if (stat.isDirectory()) {
                    makePretty(_path);
                } else if ( file.endsWith('.html') ) {
                    const content = fs.readFileSync(_path, 'utf8');
                    const newContent = content.replace(/(<(?:a|link)\s[^>]*href=["'])([^"']*)index\.html(["'][^>]*>)/g, (match, before, href, after) => {
                        return `${before}${href || '.'}${after}`;
                    });
                    fs.writeFileSync(_path, newContent);
                }
            }
        }
        makePretty('./dist');
        console.log('Done!');
        process.exit(0);
    });
});

const mimes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
};

app.use('/', async (req, res) => {
    const phpResponse = await requestHandler.request({
        url: req.url,
        headers: parseHeaders(req),
        method: req.method,
        body: await bufferRequestBody(req),
    });

    if (phpResponse.httpStatusCode === 404) {
        const relPath = path.join('./', req.url);
        const mimeType = mimes[path.extname(req.url)];
        if (mimeType && fs.existsSync(relPath)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', mimeType);
            res.end(fs.readFileSync(relPath));
            return;
        }
    }

    res.statusCode = phpResponse.httpStatusCode;
    for (const key in phpResponse.headers) {
        res.setHeader(key, phpResponse.headers[key]);
    }
    res.end(phpResponse.bytes);
});
}

run();