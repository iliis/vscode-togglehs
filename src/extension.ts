'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import { strict } from 'assert';
import { basename } from 'path';
var fileExists = require('file-exists');

// TODO: Add support for implementation headers (.inl) and toggle between the three (.hpp -> .inl -> .cpp -> .hpp)
const headerExts = [ '.h', '.hpp', '.hh', '.hxx' ];
const sourceExts = [ '.c', '.cpp', '.cc', '.cxx', '.m', '.mm', '.inl' ];

// Generates appropriate variants for the predefined extensions arrays.
function allExts(exts:string[]) {
  return exts.concat(exts.map((ext) => { return ext.toUpperCase(); }));
}

// Test whether a given file has an extension included in the given array.
function testExtension(fileName:string, exts:string[]) {
  var found = allExts(exts).find((ext) => { return ext === path.extname(fileName); });
  return undefined != found;
}

// How many folders does a have in common with b
// example: /foo/bar/baz, /foo/bar/asdf -> 2
// TODO: This currently only considers the beginning, i.e. up to the first
// folder that's different. A better matching algorithm would also consider the
// rest. For example:
//   /a/b/src/foo/bar.cpp
//   /a/b/include/foo/bar.hpp <- you probably want that, but only has /a/b in common
//   /a/b/src/bar.hpp <- but this has /a/b/src in common and currently scores better
// Or maybe make this a user configurable flag?
function commonPathParts(a:string, b:string) {
  var a_path = path.dirname(a).split(path.sep);
  var b_path = path.dirname(b).split(path.sep);
  
  for (var i = 0; i < Math.min(a_path.length, b_path.length); ++i) {
    if (a_path[i] != b_path[i]) {
      return i;
    }
  }
  return i;
}

// Finds a file matching an extension included in the given array.
// TODO: Fall back to old method of just replacing extension and checking if
// file exists if findFiles doesn't find anything (so that this works even
// outside a workspace)
async function findFile(baseName:string, exts:string[]) {
  
  var name = path.parse(baseName).name;
  
  var pattern = '**/'+name+'{' + exts.join(',') + '}';
  //console.log('searching: '+pattern)

  try {
    var matching_files = await vscode.workspace.findFiles(pattern);
    //vscode.window.showInformationMessage("Found " + values.length + " matches.");
    
    
    if (matching_files.length == 0)
    {
      // I think this cannot happen, instead findFiles will throw an exception
      console.log("No matches found.");
      return false;
    }
  
    // sort by number of common folders
    // closest match (largest number of common path elements) should be first entry
    matching_files.sort((a, b) => {
      return commonPathParts(baseName, b.fsPath) - commonPathParts(baseName, a.fsPath);
    });
    
    if (matching_files.length > 1) {
      console.log("found "+matching_files.length+" matches:");
      matching_files.map((val, i, _) => {
        console.log(" [" + i + "]: match=" + commonPathParts(baseName, val.fsPath) + " " + val.fsPath);
      });
    } else {
      console.log("only found one match: " + matching_files[0].fsPath);
    }
    
    return matching_files[0].fsPath;
  } catch (e) {
    return false; // no files found
  }
}

// Try to toggle current vscode file from a given set of extensions to another.
async function tryToggle(file:vscode.Uri, from:string[], to:string[]) {
  return new Promise<boolean>((accept, reject) => {
    if (file.scheme !== 'file') {
      reject('Unsupported file scheme.');
      return;
    }

    var fileStr = file.fsPath;
    if (!testExtension(fileStr, from)) {
      accept(false); // not a supported file
      return;
    }

    var baseName = fileStr.substr(0, fileStr.lastIndexOf('.'));
    findFile(baseName, to).then((found) => {
      if (found) {
        vscode.workspace.openTextDocument(found).then(
          (doc) => {
            var column = vscode.window.activeTextEditor.viewColumn;
            vscode.window.showTextDocument(doc, column).then(() => { accept(true); }, reject);
          }, reject
        );
      } else {
        reject('Cannot find corresponding header/source file.');
      }
    });
  });
}

// Activates the extension.
// Unfortunately, we cannot (yet) make the toggle command only displaying when a file with a matching extension is opened.
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerTextEditorCommand('togglehs.toggleHS', (textEditor, edit) => {
    var currentFile = vscode.window.activeTextEditor.document.uri;
    tryToggle(currentFile, headerExts, sourceExts).then((ok) => {
      if (!ok) {
        tryToggle(currentFile, sourceExts, headerExts).then((ok) => {
          if (!ok) {
            vscode.window.showErrorMessage('Cannot toggle to corresponding header/source, this filetype is not supported.');
          }
        }).catch((reason) => {
          vscode.window.showErrorMessage(reason);
        });
      }
    }).catch((reason) => {
      vscode.window.showErrorMessage(reason);
    });
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
}
