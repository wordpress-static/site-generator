# Get Started

<small>[Edit this page](https://github.com/wordpress-static/site-generator/edit/main/index.md)</small>

This tool is for you if you:

* Like the performance and low cost of static sites.
* Like WordPress, and its theme ecosystem.
* Are a (version) control freak.

All you need to get started is Markdown or HTML files. From this, an entire site will be generated with WordPress.

## Pages

Simply create `my-page.md` to create `[...].com/my-page/`. If the first line of the file is a heading level 1, it will be used as the title.

You can create a front page with `index.md`. If this file does not exist, the front page will be used to display blog posts.

To create nested pages, create a `parent-page` folder with an (optional) `index.md` and a `parent-page/child-page.md` file. Note that if you wish content for the parent page, it should be located at `parent-page/index.md` and not `parent-page.md`.

Multiple levels of nesting are supported:

```
top/index.md
top/middle-1.md (or top/middle-1/index.md)
top/middle-2/index.md
top/middle-2/bottom-1.md (or top/middle-2/bottom-1/index.md)
top/middle-2/bottom-2.md (or top/middle-2/bottom-2/index.md)
```

## Posts (and post types)

`posts` is a special directory. Markdown files with the pattern `yyyy-mm-dd--my-post.md` will be converted to posts.

<details>
<summary>Future</summary>
  
  In the future, it will be possible to add posts to the root to be displayed on the front page, and `posts` to be displayed on that sub page.
  
  Also in the future, it will be possible to add a config file to any folder to configure a custom post type. For example:
  
  ```
  shop/config.json
  shop/first-item.md
  shop/second-item.md
  ```
  
  ```json
  {
    "type": "product",
    "label": "Product"
  }
  ```

</details>

## Can I add media?

![Of course!](image.png)

Simply add an image or other media anywhere in the filesystem and link to it. It will be picked up.

```
![alt text](image.png)
```

Did you know that you can paste an image into VSCode and it will automatically add the Markdown code and upload it?

## Generating the Site

If you have the file on your local filesystem you can run the following [npx](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) command:

```
npx wordpress-static
```

This will create your static site in the `dist/` directory. To preview, run:

```
open dist/index.html
```

You could then manually push the dist folder to github and enable GitHub Pages. But that's a lot of manual work!

## GitHub Action

Instead of dealing with two separate folders and git repos, it's possible to automate generatig the output folder and commit it to a separate git branch that can be used for GitHub pages.

In your repo with your Markdown files, add `.github/workflows/publish.yml`:

```yml
name: Publish
on:
  push:
    branches:
      - main
concurrency:
    group: ${{ github.workflow }}
    cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx wordpress-static
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

Make sure to enable write permission for actions at Settings > Actions > General > Workflow permissions (check "Read and write permissions").

Also make sure to set up GitHub pages from the `gh-pages` branch at Setting > Pages (set "source" to "Deploy from a branch" and set "branch" to `gh-pages`).

That's it. Your static WordPress site now lives at `https://[username].github.io/[repo]/`! It's possible to configure a custom domain at Setting > Pages.

## HTML and Blocks

Yes! It will soon also allow `.html` files in addition to `.md` files in case you wish to write HTML or WordPress blocks.

## Themes? Plugins?

Yes! Working on it.

## What if I don't like Markdown?

It will be possible at some point to edit content directly in WordPress, which can then be stored as HTML files in the filesystem.






