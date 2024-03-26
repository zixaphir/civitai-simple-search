const express = require('express');
const https = require('https');
const ejs = require('ejs');
const path = require('node:path');

const app = express();
const port = 39230;

const allow_video = true;
const video_autoplay = true;

app.use(express.urlencoded({extended: true}))
app.use(express.static(path.join(__dirname, 'assets')));
app.set('views', path.join(__dirname, 'views'));

const base_url = "https://civitai.com/api/v1/models?";
const model_base_url = "https://civitai.com/models/"

function arrayFrag(name, vals, store) {
    if (vals.length == 0) {
        return store;
    };
    for (let val of vals) {
        store.push(`${name}=${val}`);
    }
    return store;
}

function make_url(args) {
    let url = base_url;
    let frags = []
    for (let arg in args) {
        if (args[arg] == "") {
            continue;
        }
        if (["types", "baseModels"].includes(arg)) {
            frags = arrayFrag(arg, args[arg], frags);
            continue;
        }
        frags.push(`${arg}=${args[arg]}`);
    }
    url += frags.join("&");
    return url;

}

async function fetchData(url, nsfw) {
    let jsondata = "";
    let fetch_models = new Promise((resolve) => {
        https.get(url, res => {
            let data = "";

            console.log(url);

            const headerDate = res.headers && res.headers.date ? res.headers.date : 'no response date';
            console.log('Status Code:', res.statusCode);
            console.log('Date in Response header:', headerDate);

            const preview_types = ["image"];
            if (allow_video) {
                preview_types.push("video");
            }

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                const models = [];
                console.log('Response ended: ');
                const json = JSON.parse(data);
                const items = json.items || [];
                const search_results = {
                    models: [],
                    meta: {
                        status: null,
                        prevCursor: null,
                        nextCursor: null,
                    },
                };

                if (items.length == 0) {
                    search_results.status = "fail";
                    console.log("No models found for query. :(");
                    resolve(search_results);
                }

                search_results.meta.prevCursor = json.metadata?.prevCursor;
                search_results.meta.nextCursor = json.metadata?.nextCursor;

                for(let model of items) {
                    /*
                    if (filter) {
                        let skip = false;
                        for (let tag of model.tags) {
                            if (tag.toLowerCase() == filter.toLowerCase()) {
                                skip = true;
                            }
                        }
                        if (skip) {
                            continue;
                        }
                    }
                    */

                    const name = model.name;
                    const description = model.description;
                    const url = `${model_base_url}${model.id}`;
                    const type = model.type;
                    const baseModels = [];
                    const preview = {
                        type: null,
                        url: null,
                    };

                    let download = "";
                    let files = null;

                    let modelVersions = model.modelVersions;
                    files = modelVersions[0]?.files;

                    try {
                        const previews = [];
                        for (const version of modelVersions) {
                            const images = version?.images;
                            if (images?.length > 0) {
                                previews.push(...images);
                            }
                            const baseModel = version?.baseModel;
                            if (baseModel && !baseModels.includes(baseModel)) {
                                baseModels.push(baseModel);
                            }
                        }
                        for (const file of previews) {
                            if (!nsfw && file.nsfw == "X") {
                                continue;
                            }
                            if (!preview_types.includes(file.type)) {
                                continue;
                            }

                            preview.url = file.url;
                            preview.type = file.type;
                        }
                    } catch(err) {
                        console.log(`Could not find model preview for ${name}.`);
                    }

                    if (!preview.type) {
                        preview.url = "imgs/noprev.png";
                        preview.type = "image";
                    }

                    if (files) {
                        for (const file of files) {
                            if (file.type != "Model") {
                                continue;
                            }
                            download = `https://civitai.com/api/download/models/${file.id}`;
                            break;
                        }
                    }

                    if (download === null) {
                        download = "";
                    }

                    search_results.models.push({
                        name: name,
                        preview: {
                            type: preview.type,
                            url: preview.url,
                        },
                        url: url,
                        description: description,
                        type: type,
                        download: download,
                        baseModels: baseModels,
                    });
                }

                search_results.status = "success";
                resolve(search_results);

            }).on('error', res => {
                console.log('Error: ', res.message);
                reject('Request failed. status: ' + res.statusCode + ', body: ' + body);
            });
        });
    });
    return fetch_models;
}

function parseURL(req) {
    const args = {
        limit: 100,
        types: ["LORA"],
        sort: "Newest",
        nsfw: "false",
    }

    // let filter = null;

    let currenturl = req.protocol + '://' + req.get('host') + req.originalUrl;

    let incoming = new URL(currenturl);

    let keys = incoming.searchParams.keys();
    let params = incoming.searchParams;
    for (let query of keys) {
        /*
        if (query == "filter") {
            filter = params.get(query);
            continue;
        }
        */
        if (["types", "baseModels"].includes(query)) {
            args[query] = params.get(query).split(",");
            continue;
        }
        args[query] = params.get(query);
    }
    return args;
}

app.set('view engine', 'ejs');

app.get('/', function (req, res) {
    const args = {
        limit: 10,
        period: "Day",
        types: ["LORA"],
        baseModels: [],
        sort: "Most Downloaded",
        nsfw: "false",
    }

    let page = make_url(args)

    fetchData(page, false).then(search_results => {
        let models = search_results.models;

        res.render("index", {
            cards: models,
            types: args.types,
            nsfw: "false",
            baseModels: args.baseModels,
            autoplay: allow_video && video_autoplay,
            meta: null, // disables pagination
        });
    });
});

app.get('/search', function (req, res) {
    const args = parseURL(req)

    let types = args.types;
    let baseModels = args.baseModels;

    if (!types) {
        types = ["Lora"]
    }

    if (!baseModels) {
        baseModels = [];
    }

    let page = make_url(args);

    fetchData(page, (args.nsfw == "true" ? true : false)).then(search_results => {
        let models = search_results.models;
        let meta = search_results.meta;

        meta.url = req.url;

        res.render("index", {
            cards: models,
            types: types,
            nsfw: args.nsfw,
            baseModels: baseModels,
            autoplay: allow_video && video_autoplay,
            meta: meta,
        });
    });
});

app.listen(port, () => {
    console.log(`Now listening on port ${port}`);
});
