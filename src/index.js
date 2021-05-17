const fs = require('fs');
const path = require('path')
const { spawn, execSync } = require('child_process');

const spawnPromise = (command, args, options) => {
  return new Promise((resolve, reject) => {
    spawn(command, args, options).on('exit', (code, signal) => {
      if (code) {
        reject([code, signal])
      } else {
        resolve([code, signal]);
      }
    });
  });
}

const forEachFile = (filePath, handler = (fileName) => {}) => {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stat) => {
      if (err) {
        reject(err);
      } else {
        if (stat.isDirectory()) {
          // read directory
          new Promise((resolve, reject) => {
            fs.readdir(filePath, (err, files) => {
              if (err) {
                reject(err);
              } else {
                Promise.all(files.map(f => forEachFile(path.join(filePath, f), handler))).then(resolve);
              }
            });
          }).then(resolve);
        } else {
          // execute the handler on this file
          handler(filePath);
          resolve();
        }
      }
    });
  });
}

class XtumlCodegenWebpackPlugin {

  static defaultOptions = {
    quiet: 1,                   // suppress stderr by default
    genWorkspace: '.codegen',
    prebuildOutput: 'out.sql',
    sourceModels: [],
    archetypes: [],
  }

  constructor(options={}) {
    this.options = this.options = { ...XtumlCodegenWebpackPlugin.defaultOptions, ...options };
    this.sourceFiles = new Set();
    this.checkDependencies = this.checkDependencies.bind(this);
    this.executeBuild = this.executeBuild.bind(this);
    this.updateCompilationDependencies = this.updateCompilationDependencies.bind(this);
  }

  // check python dependencies
  checkDependencies() {
    // check that python exists
    try {
      execSync('python', {stdio: 'ignore'});
    } catch (e) {
      throw new Error('Python is not installed.');
    }
    // check required python dependencies TODO config with requirements.txt
    for (const dep of ['pyxtuml', 'pyrsl']) {
      try {
        execSync(`python -m pip show ${dep}`, {stdio: 'ignore'})
      } catch (e) {
        throw new Error(`\`${dep}\` is not installed. Install with \`pip install ${dep}\``);
      }
    }
  }

  // execute build
  async executeBuild(compiler) {
    const firstBuild = !(compiler.watchMode && this.sourceFiles.size > 0);
    if (firstBuild || Object.keys(compiler.watchFileSystem.watcher.mtimes).some(k => this.sourceFiles.has(k))) {
      await this.prebuild(compiler);
      await this.generate(compiler);
    }
  }

  // pre-build
  async prebuild(compiler) {
    console.log('\nStarting pre-build...');
    await new Promise((resolve, reject) => {
      fs.mkdir(path.join(compiler.options.context, this.options.genWorkspace), {recursive: true}, err => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });
    const sourceModels = this.options.sourceModels.map(p => path.isAbsolute(p) ? p : path.join(compiler.options.context, p));
    if (compiler.watchMode) {  // in watch mode, update the source list
      sourceModels.forEach(sourceModel => {
        // add the file/directory to the source list
        forEachFile(sourceModel, fileName => {
          if (fileName.endsWith('.xtuml')) {
            this.sourceFiles.add(fileName);
          }
        });
      });
    }
    const exitcode = await spawnPromise(
      'python',
      [
        '-m',
        'bridgepoint.prebuild',
        '-o',
        path.join(compiler.options.context, this.options.genWorkspace, this.options.prebuildOutput),
      ].concat(sourceModels),
      {
        stdio: ['ignore', this.options.quiet > 1 ? 'ignore' : 'inherit', this.options.quiet > 0 ? 'ignore' : 'inherit',],
      }
    );
    console.log('Done.');
    return exitcode;
  }

  // generate
  async generate(compiler) {
    console.log('\nStarting code generation...');
    const archetypes = this.options.archetypes.map(p => path.isAbsolute(p) ? p : path.join(compiler.options.context, p));
    if (compiler.watchMode) {  // in watch mode, update the source list
      archetypes.forEach(arch => {
        // add the file to the source list
        this.sourceFiles.add(arch);
      });
    }
    const exitcode = await spawnPromise(
      'python',
      [
        '-m',
        'rsl.gen_erate',
        '-nopersist',
        '-import',
        path.resolve(path.join(__dirname, '..', 'schema', 'schema.sql'),
        '-import',
        path.join(compiler.options.context, this.options.genWorkspace, this.options.prebuildOutput),
      ].concat(...archetypes.map(a => ['-arch', a])),
      {
        stdio: ['ignore', this.options.quiet > 1 ? 'ignore' : 'inherit', this.options.quiet > 0 ? 'ignore' : 'inherit',],
      }
    );
    console.log('Done.');
    return exitcode;
  }

  updateCompilationDependencies(compilation) {
    // update watch dependencies
    if (compilation.compiler.watchMode) {
      for (const sourceFile of this.sourceFiles) {
        compilation.fileDependencies.add(sourceFile);
      }
    }
  }

  apply(compiler) {
    compiler.hooks.environment.tap('XtumlCodegenWebpackPlugin', this.checkDependencies);
    compiler.hooks.beforeRun.tapPromise('XtumlCodegenWebpackPlugin', this.executeBuild);
    compiler.hooks.watchRun.tapPromise('XtumlCodegenWebpackPlugin', this.executeBuild);
    compiler.hooks.afterCompile.tap('XtumlCodegenWebpackPlugin', this.updateCompilationDependencies);
  }

}

module.exports = XtumlCodegenWebpackPlugin;
