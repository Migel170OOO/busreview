// ========================================
// BUSREVIEW - BACKEND
// ========================================

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const { parse } = require("csv-parse/sync");

const app = express();


// ========================================
// CONFIGURAÇÕES
// ========================================

const PORT =
    process.env.PORT || 3000;

const RAIO_PADRAO_KM = 2;

const GTFS_DIR =
    path.join(
        __dirname,
        "data",
        "gtfs"
    );


// ========================================
// MIDDLEWARES
// ========================================

app.use(cors());

app.use(
    express.json()
);


// ========================================
// FRONTEND
// ========================================

app.use(
    express.static(
        path.join(
            __dirname,
            ".."
        )
    )
);


app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "..",
                "index.html"
            )
        );

    }
);


// ========================================
// SPTRANS
// ========================================

let sptransCookie = null;


// ========================================
// GTFS
// ========================================

let gtfsStops = [];

const gtfsStopPorId =
    new Map();

const gtfsRoutes =
    new Map();

const gtfsTrips =
    new Map();

const linhasPorParada =
    new Map();


// ========================================
// CACHE
// ========================================

const cacheCodigoOlhoVivo =
    new Map();


// ========================================
// DISTÂNCIA HAVERSINE
// ========================================

function distanciaKm(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371;

    const dLat =
        (lat2 - lat1) *
        Math.PI / 180;

    const dLon =
        (lon2 - lon1) *
        Math.PI / 180;


    const a =

        Math.sin(
            dLat / 2
        ) ** 2 +

        Math.cos(
            lat1 *
            Math.PI / 180
        ) *

        Math.cos(
            lat2 *
            Math.PI / 180
        ) *

        Math.sin(
            dLon / 2
        ) ** 2;


    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return R * c;
}


// ========================================
// LER ARQUIVO GTFS
// ========================================

function lerGTFS(
    nomeArquivo
) {

    const arquivo =
        path.join(
            GTFS_DIR,
            nomeArquivo
        );


    if (
        !fs.existsSync(
            arquivo
        )
    ) {

        throw new Error(
            `Arquivo não encontrado: ${arquivo}`
        );

    }


    const conteudo =
        fs.readFileSync(
            arquivo,
            "utf8"
        );


    return parse(
        conteudo,
        {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            bom: true
        }
    );
}


// ========================================
// CARREGAR PARADAS
// ========================================

function carregarParadasGTFS() {

    const stops =
        lerGTFS(
            "stops.txt"
        );


    gtfsStops =
        stops
            .map(
                stop => {

                    return {

                        stop_id:
                            String(
                                stop.stop_id
                            ),

                        stop_name:
                            stop.stop_name ||
                            "",

                        stop_desc:
                            stop.stop_desc ||
                            "",

                        lat:
                            Number(
                                stop.stop_lat
                            ),

                        lon:
                            Number(
                                stop.stop_lon
                            )

                    };

                }
            )
            .filter(
                stop =>

                    stop.stop_id &&

                    Number.isFinite(
                        stop.lat
                    ) &&

                    Number.isFinite(
                        stop.lon
                    )

            );


    gtfsStops.forEach(
        stop => {

            gtfsStopPorId.set(
                stop.stop_id,
                stop
            );

        }
    );


    console.log(
        "Paradas GTFS carregadas:",
        gtfsStops.length
    );

}


// ========================================
// CARREGAR ROTAS
// ========================================

function carregarRotasGTFS() {

    const routes =
        lerGTFS(
            "routes.txt"
        );


    routes.forEach(
        route => {

            gtfsRoutes.set(

                String(
                    route.route_id
                ),

                {

                    route_id:
                        String(
                            route.route_id
                        ),

                    shortName:
                        route.route_short_name ||
                        "",

                    longName:
                        route.route_long_name ||
                        ""

                }

            );

        }
    );


    console.log(
        "Rotas GTFS carregadas:",
        gtfsRoutes.size
    );

}


// ========================================
// CARREGAR VIAGENS
// ========================================

function carregarTripsGTFS() {

    const trips =
        lerGTFS(
            "trips.txt"
        );


    trips.forEach(
        trip => {

            gtfsTrips.set(

                String(
                    trip.trip_id
                ),

                {

                    trip_id:
                        String(
                            trip.trip_id
                        ),

                    route_id:
                        String(
                            trip.route_id
                        ),

                    headsign:
                        trip.trip_headsign ||
                        "",

                    direction:
                        trip.direction_id ||
                        ""

                }

            );

        }
    );


    console.log(
        "Viagens GTFS carregadas:",
        gtfsTrips.size
    );

}


// ========================================
// CARREGAR LINHAS POR PARADA
// ========================================

function carregarLinhasPorParada() {

    const stopTimes =
        lerGTFS(
            "stop_times.txt"
        );


    stopTimes.forEach(
        item => {

            const stopId =
                String(
                    item.stop_id
                );


            const trip =
                gtfsTrips.get(
                    String(
                        item.trip_id
                    )
                );


            if (!trip) {
                return;
            }


            const route =
                gtfsRoutes.get(
                    trip.route_id
                );


            if (!route) {
                return;
            }


            if (
                !linhasPorParada.has(
                    stopId
                )
            ) {

                linhasPorParada.set(
                    stopId,
                    new Map()
                );

            }


            const linhas =
                linhasPorParada.get(
                    stopId
                );


            const chave =
                `${route.route_id}-${trip.direction}-${trip.headsign}`;


            if (
                linhas.has(
                    chave
                )
            ) {

                return;
            }


            linhas.set(
                chave,
                {

                    codigo:
                        route.route_id,

                    letreiro:
                        route.shortName ||
                        route.route_id,

                    sentido:
                        trip.direction,

                    destino:
                        trip.headsign ||
                        route.longName ||
                        "Destino não informado",

                    origem:
                        "",

                    quantidadeVeiculos:
                        0,

                    previsoes:
                        []

                }
            );

        }
    );


    console.log(
        "Paradas com linhas GTFS:",
        linhasPorParada.size
    );

}


// ========================================
// CARREGAR TUDO
// ========================================

function carregarGTFS() {

    console.log(
        "=============================="
    );

    console.log(
        "CARREGANDO GTFS..."
    );


    carregarParadasGTFS();

    carregarRotasGTFS();

    carregarTripsGTFS();

    carregarLinhasPorParada();


    console.log(
        "GTFS carregado com sucesso."
    );

    console.log(
        "=============================="
    );

}


// ========================================
// AUTENTICAÇÃO SPTRANS
// ========================================

async function autenticarSPTrans() {

    try {

        if (
            !process.env.SPTRANS_TOKEN
        ) {

            console.error(
                "SPTRANS_TOKEN não encontrado."
            );

            return false;
        }


        const url =
            "https://api.olhovivo.sptrans.com.br" +
            "/v2.1/Login/Autenticar" +
            `?token=${process.env.SPTRANS_TOKEN}`;


        const resposta =
            await fetch(
                url,
                {
                    method: "POST",

                    headers: {
                        "Content-Length": "0"
                    }
                }
            );


        const texto =
            await resposta.text();


        console.log(
            "SPTrans autenticação:",
            resposta.status,
            texto
        );


        if (
            texto.trim() !==
            "true"
        ) {

            return false;
        }


        const cookies =
            resposta.headers.get(
                "set-cookie"
            );


        if (cookies) {

            sptransCookie =
                cookies.split(
                    ";"
                )[0];

        }


        return true;

    }

    catch (erro) {

        console.error(
            "Erro ao autenticar SPTrans:",
            erro
        );


        return false;

    }
}


// ========================================
// FETCH SPTRANS
// ========================================

async function fetchSPTrans(
    url
) {

    if (!sptransCookie) {

        const ok =
            await autenticarSPTrans();


        if (!ok) {

            throw new Error(
                "Não foi possível autenticar na SPTrans."
            );

        }

    }


    let resposta =
        await fetch(
            url,
            {
                headers: {

                    Cookie:
                        sptransCookie,

                    Accept:
                        "application/json"

                }
            }
        );


    // Sessão expirou
    if (
        resposta.status === 401 ||
        resposta.status === 403
    ) {

        sptransCookie = null;


        const ok =
            await autenticarSPTrans();


        if (!ok) {

            throw new Error(
                "Falha ao reautenticar SPTrans."
            );

        }


        resposta =
            await fetch(
                url,
                {
                    headers: {

                        Cookie:
                            sptransCookie,

                        Accept:
                            "application/json"

                    }
                }
            );

    }


    return resposta;
}


// ========================================
// PREVISÃO OLHO VIVO
// ========================================

async function buscarPrevisao(
    codigoParada
) {

    const codigo =
        Number(
            codigoParada
        );


    if (
        !Number.isFinite(
            codigo
        )
    ) {

        return null;

    }


    const url =
        "https://api.olhovivo.sptrans.com.br" +
        "/v2.1/Previsao/Parada" +
        `?codigoParada=${codigo}`;


    console.log(
        "Consultando previsão:",
        codigo
    );


    const resposta =
        await fetchSPTrans(
            url
        );


    if (!resposta.ok) {

        throw new Error(
            `SPTrans HTTP ${resposta.status}`
        );

    }


    const dados =
        await resposta.json();


    if (
        !dados ||
        !dados.p
    ) {

        return null;

    }


    const linhas =
        Array.isArray(
            dados.p.l
        )
            ? dados.p.l
            : [];


    const resultadoLinhas =
        linhas.map(
            linha => {

                const previsoes =
                    Array.isArray(
                        linha.vs
                    )
                        ? linha.vs
                        : [];


                return {

                    codigo:
                        linha.cl,

                    letreiro:
                        linha.c,

                    sentido:
                        linha.sl,

                    destino:
                        linha.lt0 ||
                        "",

                    origem:
                        linha.lt1 ||
                        "",

                    quantidadeVeiculos:
                        linha.qv ||
                        previsoes.length,

                    previsoes:
                        previsoes
                            .map(
                                veiculo => {

                                    return {

                                        horario:
                                            veiculo.t,

                                        acessivel:
                                            veiculo.a,

                                        prefixo:
                                            veiculo.p

                                    };

                                }
                            )
                            .filter(
                                item =>
                                    item.horario
                            )
                            .sort(
                                (a, b) =>
                                    String(
                                        a.horario
                                    )
                                    .localeCompare(
                                        String(
                                            b.horario
                                        )
                                    )
                            )

                };

            }
        );


    return {

        horarioConsulta:
            dados.hr ||
            null,

        codigoParada:
            dados.p.cp,

        nomeParada:
            dados.p.np,

        latitude:
            dados.p.py,

        longitude:
            dados.p.px,

        linhas:
            resultadoLinhas

    };
}


// ========================================
// BUSCAR PARADA NO OLHO VIVO PELO NOME
// ========================================

async function resolverCodigoOlhoVivo(
    stop
) {

    const stopId =
        String(
            stop.stop_id
        );


    if (
        cacheCodigoOlhoVivo.has(
            stopId
        )
    ) {

        return cacheCodigoOlhoVivo.get(
            stopId
        );

    }


    const nome =
        String(
            stop.stop_name ||
            ""
        ).trim();


    if (!nome) {

        cacheCodigoOlhoVivo.set(
            stopId,
            null
        );

        return null;

    }


    try {

        const url =
            "https://api.olhovivo.sptrans.com.br" +
            "/v2.1/Parada/Buscar" +
            `?termosBusca=${encodeURIComponent(nome)}`;


        const resposta =
            await fetchSPTrans(
                url
            );


        if (!resposta.ok) {

            return null;

        }


        const dados =
            await resposta.json();


        if (
            !Array.isArray(dados)
        ) {

            return null;

        }


        const candidatos =
            dados
                .filter(
                    ponto =>

                        Number.isFinite(
                            Number(
                                ponto.py
                            )
                        ) &&

                        Number.isFinite(
                            Number(
                                ponto.px
                            )
                        )

                )
                .map(
                    ponto => {

                        return {

                            ...ponto,

                            distancia:
                                distanciaKm(

                                    stop.lat,
                                    stop.lon,

                                    Number(
                                        ponto.py
                                    ),

                                    Number(
                                        ponto.px
                                    )

                                )

                        };

                    }
                )
                .sort(
                    (a, b) =>
                        a.distancia -
                        b.distancia
                );


        if (
            candidatos.length === 0
        ) {

            cacheCodigoOlhoVivo.set(
                stopId,
                null
            );

            return null;

        }


        const melhor =
            candidatos[0];


        // Não associar uma parada distante
        if (
            melhor.distancia >
            0.3
        ) {

            cacheCodigoOlhoVivo.set(
                stopId,
                null
            );

            return null;

        }


        const codigo =
            Number(
                melhor.cp
            );


        if (
            !Number.isFinite(
                codigo
            )
        ) {

            return null;

        }


        cacheCodigoOlhoVivo.set(
            stopId,
            codigo
        );


        console.log(
            "Parada relacionada:",
            stopId,
            "->",
            codigo
        );


        return codigo;

    }

    catch (erro) {

        console.error(
            "Erro ao resolver parada:",
            erro.message
        );


        return null;

    }
}


// ========================================
// LINHAS ESTÁTICAS DO GTFS
// ========================================

function pegarLinhasGTFS(
    stopId
) {

    const mapa =
        linhasPorParada.get(
            String(
                stopId
            )
        );


    if (!mapa) {
        return [];
    }


    return Array.from(
        mapa.values()
    )
    .sort(
        (a, b) =>

            String(
                a.letreiro
            )
            .localeCompare(
                String(
                    b.letreiro
                )
            )
    );
}


// ========================================
// API - PARADAS PRÓXIMAS
// ========================================

app.get(
    "/api/paradas",
    (req, res) => {

        try {

            const lat =
                Number(
                    req.query.lat
                );

            const lon =
                Number(
                    req.query.lon
                );


            if (
                !Number.isFinite(lat) ||
                !Number.isFinite(lon)
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Latitude e longitude inválidas."
                    });

            }


            let raio =
                Number(
                    req.query.raio
                );


            if (
                !Number.isFinite(raio)
            ) {

                raio =
                    RAIO_PADRAO_KM;

            }


            raio =
                Math.max(
                    0.1,
                    Math.min(
                        raio,
                        5
                    )
                );


            const paradas =
                [];


            for (
                const stop
                of gtfsStops
            ) {

                const distancia =
                    distanciaKm(

                        lat,
                        lon,

                        stop.lat,
                        stop.lon

                    );


                if (
                    distancia >
                    raio
                ) {

                    continue;

                }


                paradas.push({

                    cp:
                        stop.stop_id,

                    gtfsStopId:
                        stop.stop_id,

                    np:
                        stop.stop_name ||
                        "Ponto de ônibus",

                    ed:
                        stop.stop_desc ||
                        "",

                    py:
                        stop.lat,

                    px:
                        stop.lon,

                    distanciaKm:
                        distancia,

                    fonte:
                        "GTFS"

                });

            }


            paradas.sort(
                (a, b) =>
                    a.distanciaKm -
                    b.distanciaKm
            );


            console.log(
                "=============================="
            );

            console.log(
                "PARADAS GTFS"
            );

            console.log(
                "Localização:",
                lat,
                lon
            );

            console.log(
                "Raio:",
                raio,
                "km"
            );

            console.log(
                "Total:",
                paradas.length
            );

            console.log(
                "=============================="
            );


            return res.json(
                paradas
            );

        }

        catch (erro) {

            console.error(
                "ERRO /api/paradas:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao buscar paradas."
                });

        }

    }
);


// ========================================
// API - LINHAS E HORÁRIOS
// ========================================

app.get(
    "/api/paradas/:stopId/linhas",
    async (req, res) => {

        try {

            const stopId =
                String(
                    req.params.stopId
                );


            console.log(
                "=============================="
            );

            console.log(
                "PARADA CLICADA:",
                stopId
            );


            const stop =
                gtfsStopPorId.get(
                    stopId
                );


            if (!stop) {

                return res
                    .status(404)
                    .json({
                        erro:
                            "Parada não encontrada no GTFS."
                    });

            }


            // ========================================
            // TENTATIVA 1
            // USAR O STOP_ID DIRETAMENTE
            // ========================================

            const codigoDireto =
                Number(
                    stopId
                );


            if (
                Number.isFinite(
                    codigoDireto
                )
            ) {

                try {

                    console.log(
                        "Tentativa direta:",
                        codigoDireto
                    );


                    const previsao =
                        await buscarPrevisao(
                            codigoDireto
                        );


                    if (
                        previsao &&
                        previsao.linhas.length >
                        0
                    ) {

                        console.log(
                            "PREVISÃO DIRETA OK"
                        );

                        console.log(
                            "Linhas:",
                            previsao.linhas.length
                        );


                        return res.json({

                            ponto: {

                                codigo:
                                    stop.stop_id,

                                codigoOlhoVivo:
                                    previsao.codigoParada,

                                nome:
                                    stop.stop_name,

                                latitude:
                                    stop.lat,

                                longitude:
                                    stop.lon

                            },

                            horarioConsulta:
                                previsao.horarioConsulta,

                            fonte:
                                "Olho Vivo",

                            tempoReal:
                                true,

                            linhas:
                                previsao.linhas

                        });

                    }


                    console.log(
                        "Código direto sem previsão."
                    );

                }

                catch (erro) {

                    console.log(
                        "Tentativa direta falhou:",
                        erro.message
                    );

                }

            }


            // ========================================
            // TENTATIVA 2
            // PROCURAR A PARADA NO OLHO VIVO
            // ========================================

            const codigoEncontrado =
                await resolverCodigoOlhoVivo(
                    stop
                );


            if (
                codigoEncontrado &&
                codigoEncontrado !==
                codigoDireto
            ) {

                try {

                    console.log(
                        "Tentativa alternativa:",
                        codigoEncontrado
                    );


                    const previsao =
                        await buscarPrevisao(
                            codigoEncontrado
                        );


                    if (
                        previsao &&
                        previsao.linhas.length >
                        0
                    ) {

                        console.log(
                            "PREVISÃO ALTERNATIVA OK"
                        );


                        return res.json({

                            ponto: {

                                codigo:
                                    stop.stop_id,

                                codigoOlhoVivo:
                                    codigoEncontrado,

                                nome:
                                    stop.stop_name,

                                latitude:
                                    stop.lat,

                                longitude:
                                    stop.lon

                            },

                            horarioConsulta:
                                previsao.horarioConsulta,

                            fonte:
                                "Olho Vivo",

                            tempoReal:
                                true,

                            linhas:
                                previsao.linhas

                        });

                    }

                }

                catch (erro) {

                    console.log(
                        "Tentativa alternativa falhou:",
                        erro.message
                    );

                }

            }


            // ========================================
            // FALLBACK GTFS
            // ========================================

            console.log(
                "SEM PREVISÃO EM TEMPO REAL."
            );


            const linhasGTFS =
                pegarLinhasGTFS(
                    stopId
                );


            console.log(
                "Linhas GTFS:",
                linhasGTFS.length
            );

            console.log(
                "=============================="
            );


            return res.json({

                ponto: {

                    codigo:
                        stop.stop_id,

                    codigoOlhoVivo:
                        null,

                    nome:
                        stop.stop_name,

                    latitude:
                        stop.lat,

                    longitude:
                        stop.lon

                },

                horarioConsulta:
                    null,

                fonte:
                    "GTFS",

                tempoReal:
                    false,

                linhas:
                    linhasGTFS

            });

        }

        catch (erro) {

            console.error(
                "ERRO LINHAS:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Não foi possível consultar esta parada."
                });

        }

    }
);


// ========================================
// INICIAR GTFS
// ========================================

try {

    carregarGTFS();

}

catch (erro) {

    console.error(
        "ERRO FATAL NO GTFS:",
        erro
    );


    process.exit(1);
}


// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(
    PORT,
    async () => {

        console.log(
            `BusReview rodando na porta ${PORT}`
        );


        await autenticarSPTrans();

    }
);