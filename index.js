const express = require('express');
const https = require('https');
const ejs = require('ejs');

const app = express();
const port = 39230;

app.use(express.urlencoded({extended: true}))
app.use(express.static('imgs'));

const base_url = "https://civitai.com/api/v1/models?";
const model_base_url = "https://civitai.com/models/"


function make_url(args) {
    let url = base_url;
    console.log(args);
    for (let arg in args) {
        if (arg == "types") {
            for (let type of args[arg]) {
                url += `&${arg}=${type}`;
            }
            continue;
        }
        url += `&${arg}=${args[arg]}`;
    }
    return url;

}

async function fetchData(url) {
    let jsondata = "";
    let promise = new Promise((resolve) => {
        https.get(url, res => {
            let data = "";

            console.log(url);

            const headerDate = res.headers && res.headers.date ? res.headers.date : 'no response date';
            console.log('Status Code:', res.statusCode);
            console.log('Date in Response header:', headerDate);

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                let models = []
                console.log('Response ended: ');
                let items = JSON.parse(data).items || [];

                if (items.length == 0) {
                    console.log("No models found for query. :(");
                    resolve([]);
                }

                let names = [];
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

                    let name = model.name;
                    let description = model.description;
                    let url = `${model_base_url}${model.id}`;
                    let preview = null;
                    let download = "";
                    let files = null;
                    let type = model.type;

                    names.push(name);

                    try {
                        files = model.modelVersions[0].files;
                    } catch(err) {
                        continue;
                    }

                    try {
                        let previews = model.modelVersions[0].images
                        for (const file of previews) {
                            if (file.type == "image") {
                                preview = file.url;
                            }
                        }
                    } catch(err) {

                    }

                    if (preview === null) {
                        preview = "noprev.png";
                    }

                    for (let file of files) {
                        if (file.type != "Model") {
                            continue;
                        }
                        download = `https://civitai.com/api/download/models/${file.id}`;
                        break;
                    }

                    models.push({
                        name: name,
                        preview: preview,
                        url: url,
                        description: description,
                        type: type,
                        download: download
                    });
                }
                console.log(`Found the following models: ["${names.join("\", \"")}"].`);
                resolve(models);

            }).on('error', res => {
                console.log('Error: ', res.message);
                reject('Request failed. status: ' + res.statusCode + ', body: ' + body);
            });
        });
    });
    models = await promise;
    return models;
}

function parseURL(req) {
    const args = {
        limit: 100,
        types: ["LORA"],
        sort: "Newest",
        nsfw: true,
    }

    let filter = null;

    let currenturl = req.protocol + '://' + req.get('host') + req.originalUrl;

    let incoming = new URL(currenturl);

    let keys = incoming.searchParams.keys();
    let params = incoming.searchParams;
    for (let query of keys) {
        if (query == "filter") {
            filter = params.get(query);
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
        sort: "Most Downloaded",
        nsfw: true,
    }

    let page = make_url(args)

    fetchData(page).then(models => {
        res.render("index", {
            cards: models,
            types: types,
        });
    });
});

app.get('/search', function (req, res) {
    const args = parseURL(req)

    let types = args["types"]

    let page = make_url(args);

    fetchData(page).then(models => {
        res.render("index", {
            cards: models,
            types: types,
        });
    });
});

app.post('/search', function (req, res) {
    const args = parseURL(req);

    for (let param in req.body) {
        args[param] = req.body[param];
    }

    console.log(args);

    let types = args["types"]

    let page = make_url(args);

    fetchData(page).then(models => {
        res.render("index", {
            cards: models,
            types: types,
        });
    });
});

app.listen(port, () => {
    console.log(`Now listening on port ${port}`);
});
