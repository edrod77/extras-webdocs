#!/usr/bin/env node

/******************************************************************************
 * Copyright (c) 2014, AllSeen Alliance. All rights reserved.
 *
 *    Permission to use, copy, modify, and/or distribute this software for any
 *    purpose with or without fee is hereby granted, provided that the above
 *    copyright notice and this permission notice appear in all copies.
 *
 *    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 *    WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 *    MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 *    ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 *    WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 *    ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 *    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 ******************************************************************************/

var marked = require('marked');
var fs = require('fs');
var highlight = require('highlight.js')
var yaml = require('yamljs')

// Note, there are some hard coded paths sprinkled through code.
var docs_dir = 'docs/';
var files_dir = 'files/';
var templates_dir = 'templates/';
var nav_file = docs_dir + 'nav.yaml';

var page_pre_filename = templates_dir + 'page_pre.html';
var page_postnav_filename = templates_dir + 'page_postnav.html';
var page_post_filename = templates_dir + 'page_post.html';

var out_base_dir = 'out/public/';
var for_import_base_dir = 'out/for_import/';
var deploy_html_dir_prefix = 'develop/';
var deploy_files_dir_prefix = 'sites/default/files/develop/';

// ==========================================================================
// File/dir manipulation helpers
// ==========================================================================

function create_parent_dirs(path) {
    var parts = path.split('/');
    var p = '';
    for (var i=0; i<parts.length-1; i++) {
        p = p + parts[i] + '/';
        if (!fs.existsSync(p)) {
            fs.mkdirSync(p);
        }
    }
}

function rmdir(path) {
    if (!fs.existsSync(path)) return;

    var files = fs.readdirSync(path);
    for (var i=0; i<files.length; i++) {
        var file = path + '/' + files[i];
        if (fs.statSync(file).isFile()) {
            fs.unlinkSync(file);
        } else {
            rmdir(file);
        }
    }
    fs.rmdirSync(path);
}

// ==========================================================================
// Main processing functions - helpers
// ==========================================================================

function adjust_href(href) {
    var adj_href = href;

    if (href.substring(0,7) == '/files/') {
        adj_href = '/' + deploy_files_dir_prefix + href.substring(7);
    } else if (href[0] == '/') {
        adj_href = '/' + deploy_html_dir_prefix + href.slice(1);
    }
    return adj_href;
}

// ==========================================================================
// Main processing functions - left nav
// ==========================================================================

function adj_nav(objs, path, show) {
    // if path found, show children, siblings, parents, parents siblings, 
    // grandparents and grandparent siblings, etc
    var path_found = false
    for (var i=0; i<objs.length; i++) {
        var obj = objs[i];
        var show_children = false
        
        if (!show)
            obj.hidden = 1
        if ('path' in obj) {
            obj.path = adjust_href(obj.path)
            if (obj.path == path) {
                obj.id = 'active'
                path_found = true
                show_children = true
            }
        }
        if ('contents' in obj && obj.contents) {
            path_found |= adj_nav(obj.contents, path, show_children)
        }
    }

    if (path_found) {
        for (var i=0; i<objs.length; i++) {
            var obj = objs[i];
            obj.hidden = 0
        }
    }
    return path_found
}

function get_indent_str(cnt) {
    var str = "";
    for (var i=0; i < cnt; i++) {
        str += " ";
    }
    return str
}
function gen_nav_html(objs, indent) {
    if (!objs) return "";

    str = "";
    str += get_indent_str(indent) + "<ul>\n"
    for (var i=0; i<objs.length; i++) {
        var obj = objs[i];
        if ('name' in obj && 'path' in obj) {
            var hidden_str = ""
            var id_str = ""
            if (obj.hidden == 1)
                hidden_str = " hidden=1"
            if ('id' in obj)
                id_str = " id='active'"
            str += get_indent_str(indent+4) + '<li' + hidden_str + '><a href="' + obj.path + 
                   '"' + id_str + '>' + obj.name + '</a></li>\n'
        }
        if ('contents' in obj && obj.contents)
            str += gen_nav_html(obj.contents, indent+4)
    }
    str += get_indent_str(indent) + "</ul>\n"
    return str;
}

// ==========================================================================
// Main processing function - doc html generation
// ==========================================================================

var pre = fs.readFileSync(page_pre_filename, 'utf8');
var postnav = fs.readFileSync(page_postnav_filename, 'utf8');
var post = fs.readFileSync(page_post_filename, 'utf8');

var renderer = new marked.Renderer();

renderer.link = function(href, title, text) {
    title_str = '';
    text_str = '';
    if (title) title_str = ' title="' + title + '"';
    if (text) text_str = text;
    return '<a href="' + adjust_href(href) + '"' + title_str + '>' + text + '</a>';
}

renderer.image = function(href, title, alt) { 
    title_str = '';
    alt_str = '';
    if (title) title_str = ' title="' + title + '"';
    if (alt) alt_str = ' alt="' + alt + '"';
    return '<img src="' + adjust_href(href) + '"' + title_str + alt_str + '>';
}

marked.setOptions({
  highlight: function (code, lang) {
    if (lang)
        return highlight.highlightAuto(code, [lang]).value;
    else
        return highlight.highlightAuto(code).value;
  },
  renderer: renderer
});

function parse_file(file) {
    console.log("Parsing file", file);

    // only process .md files
    if (file.slice(-3) != '.md') return;

    var out_file = out_base_dir + deploy_html_dir_prefix + '/' + file.slice(5,-3);
    var for_import_file = for_import_base_dir + deploy_html_dir_prefix + '/' + file.slice(5,-3);

    var content = marked(fs.readFileSync(file, 'utf8'));

    var path = file.slice(5,-3); // remove leading "docs/" and trailing ".md"
    if (path.slice(-5) == 'index') path = path.slice(0,-6);  // remove trailing "/index"
    path = '/' + deploy_html_dir_prefix + path;

    var nav_objs = yaml.parse(fs.readFileSync(nav_file, 'utf8'))
    adj_nav(nav_objs, path, false)
    var nav_html = gen_nav_html(nav_objs, 0)

    var out = pre + nav_html + postnav + content + post

    // Create file for development/preview
    create_parent_dirs(out_file);
    fs.writeFileSync(out_file, out, 'utf8');

    // Create file for Drupal import
    create_parent_dirs(for_import_file);
    fs.writeFileSync(for_import_file, content, 'utf8');
}

function parse_dir(path) {
    //console.log("Parsing dir ", path);
    var files = fs.readdirSync(path);
    for (var i in files) {
        var file = path + files[i];
        var stat = fs.statSync(file);
        if (stat.isDirectory()) {
            parse_dir(file + '/');
        } else {
            parse_file(file);
        }
    }
}

// ==========================================================================
// Main processing function - files
// ==========================================================================

function copy_files(path) {
    //console.log("Copying dir ", path);
    var files = fs.readdirSync(path);
    for (var i in files) {
        var file = path + files[i];
        var stat = fs.statSync(file);
        if (stat.isDirectory()) {
            copy_files(file + '/');
        } else {
            // Copy files into directory for development/preview
            var out_file = out_base_dir + deploy_files_dir_prefix + path.substring(6) + '/' + files[i];
            create_parent_dirs(out_file);
            fs.writeFileSync(out_file, fs.readFileSync(file))

            // Copy files into directory for import into Drupal
            var out_file = for_import_base_dir + deploy_files_dir_prefix + path.substring(6) + '/' + files[i];
            create_parent_dirs(out_file);
            fs.writeFileSync(out_file, fs.readFileSync(file))
        }
    }
}

// ==========================================================================
// Main processing function
// ==========================================================================

function build_html() {
    console.log("Building html");
    rmdir(out_base_dir);
    parse_dir(docs_dir);
    copy_files(files_dir);

    fs.writeFileSync(for_import_base_dir + 'nav.yaml', 
        fs.readFileSync(nav_file, 'utf8'));

    // Add top level index to redirect to first page of content
    fs.writeFileSync(out_base_dir + 'index', '<meta http-equiv="refresh" content="1;url=/' + 
        deploy_html_dir_prefix + '">');
}

// ==========================================================================
// Main program
// ==========================================================================
build_html();

// If 'watch' argument specified, watch for file changesa and generate html
if (process.argv.length >= 3 && process.argv[2] == 'watch') {
    require('node-watch')(['docs', 'files'], function(filename) {
        // Rebuild html unless file changed was vim and emacs backup files
        if (filename.slice(-4,-1) != '.sw' && filename.slice(-1) != '~') {
            console.log(filename, "changed");
            build_html();
        }
    });
}
