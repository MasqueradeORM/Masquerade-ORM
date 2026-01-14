import path from 'path'
import { MasqueradePlugin } from './plugin.js'


export default {
    mode: 'development',
    target: 'node',
    entry: './src/project.ts',
    devtool: 'source-map',
    plugins: [
        //other plugins...
        new MasqueradePlugin() //this should be last
    ],
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: ['ts-loader', 'masquerade-loader'],
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        filename: 'bundle.js',
        devtoolModuleFilenameTemplate: '[absolute-resource-path]', // Helps VS Code find original files
        path: path.resolve(import.meta.dirname, 'dist'),
        library: {
            type: "module"
        }
    },
    experiments: {
        outputModule: true
    },
    resolveLoader: {
        modules: ["node_modules", path.resolve(import.meta.dirname, 'loaders')]
    }

};