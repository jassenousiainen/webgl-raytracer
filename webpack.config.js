const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: [
    './src/index.js',
    './src/index.css'
  ],
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.(js)$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(glsl|vs|fs|vert|frag)$/,
        exclude: /node_modules/,
        type: 'asset/source',
        use: [
          'glslify-loader'
        ]
      }
    ]
  },
  resolve: {
    extensions: ['*', '.js']
  },
  plugins: [new HtmlWebpackPlugin({ template: path.resolve(`${__dirname}/src`, 'index.html') })],
  devServer: {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }
    }
};