'use strict'


const AWS = require('aws-sdk');
const S3 = new AWS.S3({signatureVersion: 'v4'});
const Sharp = require('sharp');
//200x200/resources/2021/10/19/1634640670139.jpg
const PathPattern = /(.+x.+?)\/(.*\/)(.*)/;

// parameters
const {BUCKET, URL} = process.env;
const WHITELIST = process.env.WHITELIST
    ? Object.freeze(process.env.WHITELIST.split(' '))
    : null;



exports.handler = async (event) => {
    const path = event.queryStringParameters.path;//  文件路径   200x200/resources/2021/10/19/1634640670139.jpg
    const parts = PathPattern.exec(path);  
    const dir = parts[2] || '';         // resources/2021/10/19/
    const resizeOption = parts[1];  // e.g. "150x150_max" // 200x200
    const sizeAndAction = resizeOption.split('_');
    const filename = parts[3];

    const sizes = sizeAndAction[0].split("x");
    const action = sizeAndAction.length > 1 ? sizeAndAction[1] : null;

    // Whitelist validation.
    if (WHITELIST && !WHITELIST.includes(resizeOption)) {
        return {
            statusCode: 400,
            body: `WHITELIST is set but does not contain the size parameter "${resizeOption}"`,
            headers: {"Content-Type": "text/plain"}
        };
    }

    // Action validation.
    if (action && action !== 'max' && action !== 'min') {
        return {
            statusCode: 400,
            body: `Unknown func parameter "${action}"\n` +
                  'For query ".../150x150_func", "_func" must be either empty, "_min" or "_max"',
            headers: {"Content-Type": "text/plain"}
        };
    }

    try {
        const data = await S3
            .getObject({Bucket: BUCKET, Key: dir + filename})
            .promise();

        const width = sizes[0] === 'AUTO' ? null : parseInt(sizes[0]);
        const height = sizes[1] === 'AUTO' ? null : parseInt(sizes[1]);
        let fit;
        switch (action) {
            case 'max':
                fit = 'inside';
                break;
            case 'min':
                fit = 'outside';
                break;
            default:
                fit = 'cover';
                break;
        }
        const result = await Sharp(data.Body, {failOnError: false})
            .resize(width, height, {withoutEnlargement: true, fit})
            .rotate()
            .toBuffer();

        await S3.putObject({
            Body: result,
            Bucket: BUCKET,
            ContentType: data.ContentType,
            Key: path,
            CacheControl: 'public, max-age=86400'
        }).promise();

        return {
            statusCode: 301,
            headers: {"Location" : `${URL}/${path}`}
        };
    } catch (e) {
        return {
            statusCode: e.statusCode || 400,
            body: 'Exception: ' + e.message,
            headers: {"Content-Type": "text/plain"}
        };
    }
}
