const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// ========================================
// SERVIR O APLICATIVO
// ========================================

app.use(express.static(path.join(__dirname, "..")));

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "index.html")
    );
});

// ========================================
// SPTRANS
// ========================================

let sptransCookie = null;

// ========================================
// AUTENTICAR NA SPTRANS
// ========================================

async function autenticarSPTrans() {
    try {
        const resposta = await fetch(
            `https://api.olhovivo.sptrans.com.br/v2.1/Login/Autenticar?token=${process.env.SPTRANS_TOKEN}`,
            {
                method: "POST",
                headers: {
                    "Content-Length": "0"
                }
            }
        );

        const texto = await resposta.text();

        console.log(
            "SPTrans autenticação:",
            resposta.status,
            texto
        );

        const cookies =
            resposta.headers.get("set-cookie");

        if (cookies) {
            sptransCookie =
                cookies.split(";")[0];
        }

        return texto === "true";

    } catch (erro) {

        console.error(
            "Erro na autenticação SPTrans:",
            erro
        );

        return false;
    }
}

// ========================================
// DISTÂNCIA EM KM
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
        Math.sin(dLat / 2) ** 2 +
        Math.cos(
            lat1 * Math.PI / 180
        ) *
        Math.cos(
            lat2 * Math.PI / 180
        ) *
        Math.sin(dLon / 2) ** 2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;
}

// ========================================
// BUSCAR PARADAS
// ========================================

app.get(
    "/api/paradas",
    async (req, res) => {

        try {

            const lat =
                Number(req.query.lat);

            const lon =
                Number(req.query.lon);

            // --------------------------------
            // VALIDAR LOCALIZAÇÃO
            // --------------------------------

            if (
                !Number.isFinite(lat) ||
                !Number.isFinite(lon)
            ) {

                return res.status(400).json({
                    erro:
                        "Latitude e longitude inválidas."
                });
            }

            console.log(
                "Buscando paradas para:",
                lat,
                lon
            );

            // --------------------------------
            // AUTENTICAR
            // --------------------------------

            if (!sptransCookie) {

                const autenticado =
                    await autenticarSPTrans();

                if (!autenticado) {

                    return res.status(500).json({
                        erro:
                            "SPTrans não autenticada."
                    });
                }
            }

            // --------------------------------
            // CONSULTAR SPTRANS
            // --------------------------------

            const url =
                `https://api.olhovivo.sptrans.com.br/v2.1/Parada/Buscar?termosBusca=${lat},${lon}`;

            console.log(
                "Consultando SPTrans..."
            );

            const resposta =
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

            if (!resposta.ok) {

                throw new Error(
                    `SPTrans respondeu HTTP ${resposta.status}`
                );
            }

            const dados =
                await resposta.json();

            // --------------------------------
            // QUANTIDADE ORIGINAL
            // --------------------------------

            console.log(
                "SPTRANS RETORNOU:",
                Array.isArray(dados)
                    ? dados.length
                    : 0,
                "PONTOS"
            );

            // --------------------------------
            // GARANTIR ARRAY
            // --------------------------------

            if (!Array.isArray(dados)) {

                console.error(
                    "SPTrans não retornou uma lista."
                );

                return res.json([]);
            }

            // --------------------------------
            // CALCULAR DISTÂNCIA
            // --------------------------------

            const pontos =
                dados
                    .filter(ponto => {

                        return (
                            ponto &&
                            Number.isFinite(
                                Number(ponto.py)
                            ) &&
                            Number.isFinite(
                                Number(ponto.px)
                            )
                        );

                    })
                    .map(ponto => {

                        const distancia =
                            distanciaKm(
                                lat,
                                lon,
                                Number(ponto.py),
                                Number(ponto.px)
                            );

                        return {
                            ...ponto,
                            distanciaKm:
                                distancia
                        };

                    });

            // --------------------------------
            // FILTRAR 2 KM
            // --------------------------------

            const pontosProximos =
                pontos
                    .filter(
                        ponto =>
                            ponto.distanciaKm <= 2
                    )
                    .sort(
                        (a, b) =>
                            a.distanciaKm -
                            b.distanciaKm
                    );

            // --------------------------------
            // DEBUG
            // --------------------------------

            console.log(
                "PONTOS VÁLIDOS:",
                pontos.length
            );

            console.log(
                "VOU ENVIAR AO NAVEGADOR:",
                pontosProximos.length,
                "PONTOS"
            );

            // --------------------------------
            // ENVIAR PARA O APP
            // --------------------------------

            res.json(
                pontosProximos
            );

        } catch (erro) {

            console.error(
                "ERRO AO BUSCAR PARADAS:",
                erro
            );

            res.status(500).json({
                erro:
                    "Erro ao consultar a SPTrans."
            });
        }
    }
);

// ========================================
// LINHAS DE UMA PARADA
// ========================================

app.get(
    "/api/paradas/:cp/linhas",
    async (req, res) => {

        try {

            const cp =
                Number(req.params.cp);

            if (!Number.isFinite(cp)) {

                return res.status(400).json({
                    erro:
                        "Código da parada inválido."
                });
            }

            // --------------------------------
            // AUTENTICAR
            // --------------------------------

            if (!sptransCookie) {

                const autenticado =
                    await autenticarSPTrans();

                if (!autenticado) {

                    return res.status(500).json({
                        erro:
                            "SPTrans não autenticada."
                    });
                }
            }

            console.log(
                "Buscando linhas da parada:",
                cp
            );

            // --------------------------------
            // CONSULTAR SPTRANS
            // --------------------------------

            const resposta =
                await fetch(
                    `https://api.olhovivo.sptrans.com.br/v2.1/Previsao/Parada?codigoParada=${cp}`,
                    {
                        headers: {
                            Cookie:
                                sptransCookie,

                            Accept:
                                "application/json"
                        }
                    }
                );

            if (!resposta.ok) {

                throw new Error(
                    `SPTrans respondeu HTTP ${resposta.status}`
                );
            }

            const dados =
                await resposta.json();

            console.log(
                "Resposta da parada:",
                dados
            );

            // --------------------------------
            // LINHAS
            // --------------------------------

            const linhas =
                dados?.p?.l || [];

            // --------------------------------
            // FORMATAR LINHAS
            // --------------------------------

            const resultado =
                linhas.map(linha => {

                    const previsoes =
                        (linha.vs || [])
                            .map(veiculo => {

                                return {
                                    horario:
                                        veiculo.t,

                                    acessivel:
                                        veiculo.a,

                                    prefixo:
                                        veiculo.p
                                };

                            })
                            .sort(
                                (a, b) =>
                                    (
                                        a.horario || ""
                                    ).localeCompare(
                                        b.horario || ""
                                    )
                            );

                    return {

                        codigo:
                            linha.cl,

                        letreiro:
                            linha.c,

                        sentido:
                            linha.sl,

                        destino:
                            linha.lt0,

                        origem:
                            linha.lt1,

                        quantidadeVeiculos:
                            linha.qv || 0,

                        previsoes
                    };
                });

            // --------------------------------
            // RESPONDER
            // --------------------------------

            res.json({

                ponto: {

                    codigo:
                        dados?.p?.cp,

                    nome:
                        dados?.p?.np,

                    latitude:
                        dados?.p?.py,

                    longitude:
                        dados?.p?.px
                },

                horarioConsulta:
                    dados?.hr,

                linhas:
                    resultado
            });

        } catch (erro) {

            console.error(
                "ERRO AO BUSCAR LINHAS:",
                erro
            );

            res.status(500).json({
                erro:
                    "Não foi possível consultar as linhas desta parada."
            });
        }
    }
);

// ========================================
// INICIAR SERVIDOR
// ========================================

const PORT =
    process.env.PORT || 3000;

app.listen(
    PORT,
    async () => {

        console.log(
            `BusReview rodando na porta ${PORT}`
        );

        await autenticarSPTrans();
    }
);