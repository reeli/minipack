const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");

let ID = 0;

// file to ast
function createAsset(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const ast = parser.parse(content, {
    sourceType: "module"
  });

  const deps = [];
  traverse(ast, {
    ImportDeclaration: ({node}) => {
      deps.push(node.source.value);
    }
  });

  const {code} = babel.transformFromAst(ast, null, {
    presets: [
      require("@babel/preset-env")
    ]
  });

  return {
    id: ID++,
    filename,
    deps,
    code,
  }
}

// ast to dependency graph
function createGraph(mainAsset) {
  const queue = [mainAsset];

  for (const asset of queue) {
    asset.mapping = {};
    asset.deps.forEach((relativePath) => {
      const dirname = path.dirname(asset.filename);
      const absolutePath = path.join(dirname, relativePath);
      const child = createAsset(absolutePath);

      asset.mapping = {
        [relativePath]: child.id
      };

      queue.push(child);
    })
  }
  return queue;
}

// dependency graph to bundle
function bundle(graph) {
  let modules = "";

  graph.forEach(({id, code, mapping}) => {
    modules += `${id}: [
      function(require, module, exports) {
        ${code} 
      },
      ${JSON.stringify(mapping)},
    ],`
  });

  const result = `
    (function(modules){
      function require(id) {
        const [fn, mapping] = modules[id];
        
        function localRequire(name) {
          return require(mapping[name]);
        }
        
        const module = { exports: {} };
        
        fn(localRequire, module, module.exports);
        
        return module.exports;
      }
      
      require(0);
      
    })({${modules}})
  `;
  return result;
}

const mainAsset = createAsset("./examples/entry.js");
const graph = createGraph(mainAsset);

const result = bundle(graph);
console.log(result);

