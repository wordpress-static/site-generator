import fs from 'fs';
import path from 'path';
import { serialize, pasteHandler } from '@wordpress/blocks';
import { setSiteOptions } from '@wp-playground/blueprints';

const gitignore = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : '';

function bytesToBase64(bytes) {
    const binString = String.fromCodePoint(...bytes);
    return btoa(binString);
}

function stringToBase64(str) {
    return bytesToBase64(new TextEncoder().encode(str));
}

function phpVar(value) {
    return `json_decode(base64_decode('${stringToBase64(
        JSON.stringify(value)
    )}'), true)`;
}

async function insertPost(php, post) {
    const decoder = new TextDecoder();
    const response = await php.run({
        code: `<?php
require_once 'wordpress/wp-load.php';
$post_id = wp_insert_post(${phpVar(post)});
echo $post_id;
`
    });
    return decoder.decode(response.bytes);
}

function convertInternalLinks(md, currentDir) {
    return md.replace(/(<a\s+[^>]*href=["'])([^"']+)(["'][^>]*>)/g, (match, before, href, after) => {
        const exists = fs.existsSync(path.join(currentDir, href));
        console.log(exists, path.join(currentDir, href));
        if ( exists ) {
            const dir = path.dirname(href);
            const base = path.basename(href, path.extname(href));
            const isPost = /^\d{4}-\d{2}-\d{2}-/.test(base);
            if ( isPost ) {
                const [ year, month, day, ...rest ] = base.split('-');
                const slug = rest.join('-');
                href = path.join(dir, year, month, day, slug);
            } else if ( base === 'index' ) {
                href = dir;
            } else {
                href = path.join(dir, base);
            }
            href = href.endsWith('/') ? href : href + '/';
        }
        return `${before}${href}${after}`;
    });
}

function mdToPost(md, currentDir) {
    const original = console.log;
    console.log = () => {};
    let blocks = pasteHandler({ plainText: md, mode: 'BLOCKS' });
    console.log = original;
    const [ firstBlock, ...rest ] = blocks;
    let title;
    if ( firstBlock && firstBlock.name === 'core/heading' && firstBlock.attributes.level === 1) {
        title = firstBlock.attributes.content;
        blocks = rest;
    }
    const serialized = serialize(blocks);
    return {
        title,
        content: convertInternalLinks( serialized, currentDir )
    };
}

const POST_TYPE_MAP = {
    'posts': 'post',
    'blog': 'post',
};

async function processPostType(php, dir, postType) {
    const posts = fs.readdirSync(dir);
    for (const file of posts) {
        if (path.extname(file) !== '.md') {
            continue;
        }
        const md = fs.readFileSync(path.join(dir, file), 'utf8');
        const [baseName] = file.split('.');
        const [year, month, day, ...rest] = baseName.split('-');
        const date = new Date(year, month - 1, day);
        const formattedDate = date.toISOString().split('T')[0];
        const slug = rest.join('-');
        const { title = slug, content } = mdToPost(md, dir);
        const post = {
            'post_type': postType,
            'post_date': formattedDate,
            'post_name': slug,
            'post_title': title,
            'post_content': content,
            'post_status': 'publish',
            'post_author': 1
        }
        await insertPost(php, post);
    }
    console.log( `Created all ${postType} items` );
}

async function processPage(php, filePath, parentId) {
    const md = fs.readFileSync( filePath, 'utf8');
    const baseName = path.basename(filePath);
    const [slug] = baseName.split('.');    
    const { title = slug, content } = mdToPost(md, path.dirname(filePath));
    const post = {
        'post_type': 'page',
        'post_name': slug,
        'post_title': title,
        'post_content': content,
        'post_status': 'publish',
        'post_author': 1,
        'post_parent': parentId
    }
    const postId = await insertPost(php, post);
    console.log( `Created page ${filePath} #${postId}`, parentId ? `, parent: #${parentId}` : '' );
    return postId;
}

async function processPages( php, dir, postId) {
    if ( postId !== undefined ) {
        let md = '';
        const index = path.join(dir, 'index.md');
        if (fs.existsSync(index)) {
            md = fs.readFileSync(index, 'utf8');
        }
        const slug = path.basename(dir);
        const { title = slug, content } = mdToPost(md, dir );
        const post = {
            'post_type': 'page',
            'post_title': title,
            'post_name': slug,
            'post_content': content,
            'post_status': 'publish',
            'post_author': 1,
            'post_parent': postId
        };
        postId = await insertPost(php, post);
        console.log( `Created page ${dir} #${postId}` );
    }
    const pages = fs.readdirSync(dir);

    for (const file of pages) {
        if (file.startsWith('.')) {
            continue;
        }
        const filePath = path.join(dir, file);
        // if directory, recurse
        if (fs.statSync(filePath).isDirectory()) {
            // Ignore if filePath matches a .gitignore pattern.
            if (gitignore.split('\n').some(pattern => filePath === pattern)) {
                console.log( `Ignoring ${filePath}` );
                continue;
            }
            // Do do: post type config file.
            if (POST_TYPE_MAP[file]) {
                await processPostType( php, filePath, POST_TYPE_MAP[file]);
            } else {
                await processPages( php, filePath, postId ?? 0);
            }
        } else {
            const [slug] = file.split('.');
            if (path.extname(file) === '.md' && slug !== 'index' && ! pages.includes(slug)) {
                await processPage( php, filePath, postId);
            }
        }
    }
}

export default async function importStatic(php) {
    console.log('Current working directory:', process.cwd());
    // Check for a front page.
    if (fs.existsSync('index.md')) {
        const postId = await processPage( php, 'index.md' );
        console.log( `Setting front page to #${postId}` );
        php.run({
            code: `<?php
require_once 'wordpress/wp-load.php';
update_option('show_on_front', 'page');
update_option('page_on_front', ${phpVar(postId)});
$post_id = wp_insert_post(array( 'post_type' => 'page', 'post_name' => 'posts', 'post_title' => 'Posts', 'post_content' => '', 'post_status' => 'publish'));
update_option('page_for_posts', $post_id);
`
        });
    }
    await processPages( php, '.' );
    if (fs.existsSync('config.json')) {
        const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        await setSiteOptions(php, {
            options: {
                "blogname": config.title,
                "blogdescription": config.description
            }
        });
    }
}
