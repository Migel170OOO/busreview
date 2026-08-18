// ============================================================
// BUSREVIEW
// VERSÃO SEM RECLAMAÇÕES — SOMENTE AVALIAÇÕES
// ============================================================


// ============================================================
// CONFIGURAÇÕES
// ============================================================

const RAIO_KM = 2;

const RAIO_ORIGEM_ROTA_M = 800;
const RAIO_DESTINO_ROTA_M = 800;

const MAX_PARADAS_ORIGEM = 8;
const MAX_PARADAS_DESTINO = 12;

const LIMITE_VERDE_MIN = 19;
const LIMITE_PREVISAO_MIN = 40;

const INTERVALO_ATUALIZACAO_MS = 20000;
const TEMPO_AMARELO_MS = 60000;


// ============================================================
// ESTADO
// ============================================================

let usuarioLat = null;
let usuarioLon = null;

let usuarioMarker = null;
let raioCircle = null;

let pontosMarkers = [];

let pontoAbertoAtual = null;
let pontoAbertoIdAtual = null;

let timerAtualizacaoPonto = null;


// ============================================================
// LUGARES
// ============================================================

let lugarEmEdicaoId = null;

let modoMarcarLugar = false;

let lugarLatTemporario = null;
let lugarLonTemporario = null;

let marcadorLugarTemporario = null;
let marcadorDestino = null;


// ============================================================
// AVALIAÇÕES
// ============================================================

let notaAtual = 0;

let linhaEmAvaliacao = null;
let pontoEmAvaliacao = null;

let linhaReviewsAtual = null;
let pontoReviewsAtual = null;

let filtroReviewsAtual = 0;


// ============================================================
// CACHE / PREVISÕES
// ============================================================

const historicoPrevisoes =
    new Map();

const cacheLinhasParada =
    new Map();


// ============================================================
// MAPA
// ============================================================

const map =
    L.map("map")
        .setView(
            [
                -23.5505,
                -46.6333
            ],
            14
        );


L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
        attribution:
            "© OpenStreetMap © CARTO",

        maxZoom:
            19
    }
)
.addTo(map);


// ============================================================
// ÍCONES
// ============================================================

const userIcon =
    L.divIcon({
        className: "",

        html:
            `<div class="user-marker"></div>`,

        iconSize:
            [18, 18],

        iconAnchor:
            [9, 9]
    });


const stopIcon =
    L.divIcon({
        className: "",

        html:
            `<div class="stop-marker"></div>`,

        iconSize:
            [20, 20],

        iconAnchor:
            [10, 10]
    });


const destinationIcon =
    L.divIcon({
        className: "",

        html:
            `<div class="destination-marker">★</div>`,

        iconSize:
            [42, 42],

        iconAnchor:
            [21, 21]
    });


const tempPlaceIcon =
    L.divIcon({
        className: "",

        html:
            `<div class="temp-place-marker">+</div>`,

        iconSize:
            [38, 38],

        iconAnchor:
            [19, 19]
    });


// ============================================================
// UTILIDADES
// ============================================================

function escaparHTML(texto) {

    return String(
        texto ?? ""
    )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function normalizarTexto(texto) {

    return String(
        texto ?? ""
    )
    .trim()
    .toUpperCase()
    .replace(
        /\s+/g,
        " "
    );

}


function codigoDoPonto(ponto) {

    return String(
        ponto?.gtfsStopId ||
        ponto?.cp ||
        ""
    );

}


function numeroDaLinha(linha) {

    return String(
        linha?.letreiro ||
        linha?.codigo ||
        "Linha"
    );

}


// ============================================================
// DESTINO / ORIGEM
// ============================================================

function destinoDaLinha(linha) {

    const sentido =
        Number(
            linha?.sentido
        );


    if (
        sentido === 2
    ) {

        return String(
            linha?.origem ||
            linha?.destino ||
            "Destino não informado"
        );

    }


    return String(
        linha?.destino ||
        linha?.origem ||
        "Destino não informado"
    );

}


function origemDaLinha(linha) {

    const sentido =
        Number(
            linha?.sentido
        );


    if (
        sentido === 2
    ) {

        return String(
            linha?.destino ||
            ""
        );

    }


    return String(
        linha?.origem ||
        ""
    );

}


// ============================================================
// CHAVES DAS LINHAS
// ============================================================

function chaveServico(linha) {

    return [

        normalizarTexto(
            numeroDaLinha(
                linha
            )
        ),

        String(
            Number(
                linha?.sentido
            ) ||
            "x"
        )

    ].join("|");

}


function chaveDaLinha(linha) {

    return [

        chaveServico(
            linha
        ),

        normalizarTexto(
            destinoDaLinha(
                linha
            )
        )

    ].join("|");

}


// ============================================================
// DISTÂNCIA
// ============================================================

function distanciaMetros(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R =
        6371000;


    const p1 =
        Number(lat1) *
        Math.PI / 180;


    const p2 =
        Number(lat2) *
        Math.PI / 180;


    const dLat =
        (
            Number(lat2) -
            Number(lat1)
        ) *
        Math.PI / 180;


    const dLon =
        (
            Number(lon2) -
            Number(lon1)
        ) *
        Math.PI / 180;


    const a =

        Math.sin(
            dLat / 2
        ) ** 2 +

        Math.cos(p1) *

        Math.cos(p2) *

        Math.sin(
            dLon / 2
        ) ** 2;


    return (

        R *

        2 *

        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        )

    );

}


// ============================================================
// HORÁRIOS
// ============================================================

function timestampDoHorario(horario) {

    if (!horario) {

        return null;

    }


    const partes =
        String(
            horario
        )
        .split(":");


    if (
        partes.length < 2
    ) {

        return null;

    }


    const hora =
        Number(
            partes[0]
        );


    const minuto =
        Number(
            partes[1]
        );


    if (
        !Number.isFinite(hora) ||
        !Number.isFinite(minuto)
    ) {

        return null;

    }


    const agora =
        new Date();


    const chegada =
        new Date();


    chegada.setHours(
        hora,
        minuto,
        0,
        0
    );


    if (
        chegada.getTime() <
        agora.getTime() -
        60000
    ) {

        chegada.setDate(
            chegada.getDate() + 1
        );

    }


    return chegada.getTime();

}


function minutosAteHorario(horario) {

    const chegada =
        timestampDoHorario(
            horario
        );


    if (
        chegada === null
    ) {

        return null;

    }


    return Math.max(

        0,

        Math.round(

            (
                chegada -
                Date.now()
            ) /

            60000

        )

    );

}


// ============================================================
// PREVISÕES
// ============================================================

function chaveDoVeiculo(
    linha,
    previsao
) {

    const prefixo =
        String(
            previsao?.prefixo ||
            ""
        )
        .trim();


    if (!prefixo) {

        return null;

    }


    return (
        `${chaveServico(linha)}|${prefixo}`
    );

}


function estadoDaPrevisao(
    linha,
    previsao,
    minutos
) {

    const agora =
        Date.now();


    const chave =
        chaveDoVeiculo(
            linha,
            previsao
        );


    if (chave) {

        const anterior =
            historicoPrevisoes.get(
                chave
            );


        const horarioAtual =
            String(
                previsao?.horario ||
                ""
            );


        let amareloAte =
            anterior?.amareloAte ||
            0;


        if (
            anterior &&
            anterior.horario &&
            anterior.horario !==
            horarioAtual
        ) {

            amareloAte =
                agora +
                TEMPO_AMARELO_MS;

        }


        historicoPrevisoes.set(
            chave,
            {
                horario:
                    horarioAtual,

                amareloAte,

                vistoEm:
                    agora
            }
        );


        if (
            amareloAte >
            agora
        ) {

            return {
                classe:
                    "previsao-amarela",

                texto:
                    "Horário alterado"
            };

        }

    }


    if (
        minutos <=
        LIMITE_VERDE_MIN
    ) {

        return {
            classe:
                "previsao-verde",

            texto:
                "Chegando em breve"
        };

    }


    return {
        classe:
            "previsao-vermelha",

        texto:
            "Horário previsto"
    };

}


// ============================================================
// MENU
// ============================================================

function abrirMenu() {

    document
        .getElementById(
            "menu-lateral"
        )
        ?.classList
        .add(
            "aberto"
        );


    document
        .getElementById(
            "menu-fundo"
        )
        ?.classList
        .remove(
            "oculto"
        );

}


function fecharMenu() {

    document
        .getElementById(
            "menu-lateral"
        )
        ?.classList
        .remove(
            "aberto"
        );


    document
        .getElementById(
            "menu-fundo"
        )
        ?.classList
        .add(
            "oculto"
        );

}


// ============================================================
// LUGARES SALVOS
// ============================================================

function carregarLugares() {

    try {

        const dados =
            JSON.parse(

                localStorage.getItem(
                    "busreview_lugares"
                ) ||

                "[]"

            );


        return Array.isArray(dados)

            ? dados

            : [];

    }

    catch {

        return [];

    }

}


function salvarLugares(lista) {

    localStorage.setItem(

        "busreview_lugares",

        JSON.stringify(
            lista
        )

    );

}


function gerarIdLugar() {

    return (

        String(
            Date.now()
        ) +

        "-" +

        Math.random()
            .toString(16)
            .slice(2)

    );

}


// ============================================================
// RENDERIZAR LUGARES
// ============================================================

function renderizarLugaresMenu() {

    const lista =
        document.getElementById(
            "lista-lugares-menu"
        );


    if (!lista) {

        return;

    }


    const lugares =
        carregarLugares();


    lista.innerHTML =
        "";


    if (
        !lugares.length
    ) {

        lista.innerHTML = `

            <div class="menu-vazio">

                Você ainda não salvou nenhum lugar.

                <br><br>

                Crie Casa, Escola, Trabalho,
                Treino ou qualquer outro
                ponto de referência.

            </div>

        `;


        return;

    }


    lugares.forEach(
        lugar => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "lugar-menu-card";


            item.innerHTML = `

                <button
                    class="lugar-menu-principal"
                    type="button"
                >

                    <span class="menu-item-icone">

                        ${escaparHTML(
                            lugar.icone ||
                            "📍"
                        )}

                    </span>


                    <span class="menu-item-textos">

                        <strong>

                            ${escaparHTML(
                                lugar.nome
                            )}

                        </strong>


                        <small>

                            ${escaparHTML(
                                lugar.endereco ||
                                "Local salvo no mapa"
                            )}

                        </small>

                    </span>


                    <span class="menu-seta">
                        ›
                    </span>

                </button>


                <button
                    class="lugar-menu-editar"
                    type="button"
                >
                    ⋯
                </button>

            `;


            item
                .querySelector(
                    ".lugar-menu-principal"
                )
                ?.addEventListener(
                    "click",
                    () => {

                        irParaLugar(
                            lugar.id
                        );

                    }
                );


            item
                .querySelector(
                    ".lugar-menu-editar"
                )
                ?.addEventListener(
                    "click",
                    evento => {

                        evento.stopPropagation();


                        editarLugar(
                            lugar.id
                        );

                    }
                );


            lista.appendChild(
                item
            );

        }
    );

}


// ============================================================
// NOVO LUGAR
// ============================================================

function abrirModalNovoLugar() {

    fecharMenu();


    lugarEmEdicaoId =
        null;


    lugarLatTemporario =
        null;


    lugarLonTemporario =
        null;


    limparMarcadorLugarTemporario();


    const titulo =
        document.getElementById(
            "tituloModalLugar"
        );


    if (titulo) {

        titulo.textContent =
            "Adicionar lugar";

    }


    const nome =
        document.getElementById(
            "nomeLugar"
        );


    if (nome) {

        nome.value =
            "";

    }


    const endereco =
        document.getElementById(
            "enderecoLugar"
        );


    if (endereco) {

        endereco.value =
            "";

    }


    const icone =
        document.getElementById(
            "iconeLugar"
        );


    if (icone) {

        icone.value =
            "📍";

    }


    const status =
        document.getElementById(
            "statusBuscaEndereco"
        );


    if (status) {

        status.textContent =
            "";

    }


    atualizarCoordenadasLugarNaTela();


    document
        .getElementById(
            "botaoExcluirLugar"
        )
        ?.classList
        .add(
            "oculto"
        );


    document
        .getElementById(
            "modalLugar"
        )
        ?.classList
        .remove(
            "oculto"
        );

}


// ============================================================
// EDITAR LUGAR
// ============================================================

function editarLugar(id) {

    const lugar =
        carregarLugares()
            .find(
                item =>
                    item.id === id
            );


    if (!lugar) {

        return;

    }


    fecharMenu();


    lugarEmEdicaoId =
        id;


    lugarLatTemporario =
        Number(
            lugar.lat
        );


    lugarLonTemporario =
        Number(
            lugar.lon
        );


    const titulo =
        document.getElementById(
            "tituloModalLugar"
        );


    if (titulo) {

        titulo.textContent =
            "Editar lugar";

    }


    const nome =
        document.getElementById(
            "nomeLugar"
        );


    if (nome) {

        nome.value =
            lugar.nome ||
            "";

    }


    const endereco =
        document.getElementById(
            "enderecoLugar"
        );


    if (endereco) {

        endereco.value =
            lugar.endereco ||
            "";

    }


    const icone =
        document.getElementById(
            "iconeLugar"
        );


    if (icone) {

        icone.value =
            lugar.icone ||
            "📍";

    }


    atualizarCoordenadasLugarNaTela();


    mostrarMarcadorLugarTemporario();


    document
        .getElementById(
            "botaoExcluirLugar"
        )
        ?.classList
        .remove(
            "oculto"
        );


    document
        .getElementById(
            "modalLugar"
        )
        ?.classList
        .remove(
            "oculto"
        );

}


// ============================================================
// FECHAR MODAL LUGAR
// ============================================================

function fecharModalLugar() {

    modoMarcarLugar =
        false;


    document
        .getElementById(
            "modalLugar"
        )
        ?.classList
        .add(
            "oculto"
        );


    document
        .getElementById(
            "aviso-marcar-lugar"
        )
        ?.classList
        .add(
            "oculto"
        );


    limparMarcadorLugarTemporario();

}


// ============================================================
// COORDENADAS
// ============================================================

function atualizarCoordenadasLugarNaTela() {

    const elemento =
        document.getElementById(
            "coordenadasLugar"
        );


    if (!elemento) {

        return;

    }


    if (
        Number.isFinite(
            lugarLatTemporario
        ) &&

        Number.isFinite(
            lugarLonTemporario
        )
    ) {

        elemento.textContent =

            "Local definido: " +

            lugarLatTemporario
                .toFixed(5) +

            ", " +

            lugarLonTemporario
                .toFixed(5);


        elemento.classList.add(
            "definido"
        );

    }

    else {

        elemento.textContent =
            "Nenhuma localização definida ainda.";


        elemento.classList.remove(
            "definido"
        );

    }

}


// ============================================================
// USAR MINHA LOCALIZAÇÃO
// ============================================================

function usarMinhaLocalizacaoNoLugar() {

    if (
        !Number.isFinite(usuarioLat) ||
        !Number.isFinite(usuarioLon)
    ) {

        alert(
            "Ainda não consegui sua localização."
        );


        return;

    }


    lugarLatTemporario =
        usuarioLat;


    lugarLonTemporario =
        usuarioLon;


    atualizarCoordenadasLugarNaTela();


    mostrarMarcadorLugarTemporario();

}


// ============================================================
// MARCAR NO MAPA
// ============================================================

function marcarLugarNoMapa() {

    modoMarcarLugar =
        true;


    document
        .getElementById(
            "modalLugar"
        )
        ?.classList
        .add(
            "oculto"
        );


    document
        .getElementById(
            "aviso-marcar-lugar"
        )
        ?.classList
        .remove(
            "oculto"
        );

}


function cancelarMarcacaoLugar() {

    modoMarcarLugar =
        false;


    document
        .getElementById(
            "aviso-marcar-lugar"
        )
        ?.classList
        .add(
            "oculto"
        );


    document
        .getElementById(
            "modalLugar"
        )
        ?.classList
        .remove(
            "oculto"
        );

}


// ============================================================
// MARCADOR TEMPORÁRIO
// ============================================================

function mostrarMarcadorLugarTemporario() {

    limparMarcadorLugarTemporario();


    if (
        !Number.isFinite(
            lugarLatTemporario
        ) ||

        !Number.isFinite(
            lugarLonTemporario
        )
    ) {

        return;

    }


    marcadorLugarTemporario =
        L.marker(
            [
                lugarLatTemporario,
                lugarLonTemporario
            ],
            {
                icon:
                    tempPlaceIcon,

                zIndexOffset:
                    1200
            }
        )
        .addTo(map);

}


function limparMarcadorLugarTemporario() {

    if (
        marcadorLugarTemporario
    ) {

        map.removeLayer(
            marcadorLugarTemporario
        );


        marcadorLugarTemporario =
            null;

    }

}


// ============================================================
// BUSCAR ENDEREÇO
// ============================================================

async function buscarEnderecoLugar() {

    const campo =
        document.getElementById(
            "enderecoLugar"
        );


    const status =
        document.getElementById(
            "statusBuscaEndereco"
        );


    const endereco =
        campo?.value
            .trim();


    if (!endereco) {

        alert(
            "Digite um endereço primeiro."
        );


        return;

    }


    if (status) {

        status.textContent =
            "Buscando endereço...";

    }


    try {

        let consulta =
            endereco;


        if (
            !/são paulo|sao paulo/i
                .test(
                    endereco
                )
        ) {

            consulta +=
                ", São Paulo, SP, Brasil";

        }


        const resposta =
            await fetch(

                "https://nominatim.openstreetmap.org/search" +

                "?format=json" +

                "&limit=1" +

                "&countrycodes=br" +

                "&q=" +

                encodeURIComponent(
                    consulta
                ),

                {
                    headers: {
                        "Accept-Language":
                            "pt-BR"
                    }
                }

            );


        if (
            !resposta.ok
        ) {

            throw new Error(
                "Erro ao buscar endereço"
            );

        }


        const dados =
            await resposta.json();


        if (
            !Array.isArray(dados) ||
            !dados.length
        ) {

            if (status) {

                status.textContent =
                    "Não encontrei. Tente marcar no mapa.";

            }


            return;

        }


        lugarLatTemporario =
            Number(
                dados[0].lat
            );


        lugarLonTemporario =
            Number(
                dados[0].lon
            );


        atualizarCoordenadasLugarNaTela();


        mostrarMarcadorLugarTemporario();


        map.setView(
            [
                lugarLatTemporario,
                lugarLonTemporario
            ],
            17
        );


        if (status) {

            status.textContent =
                "Endereço encontrado. Confira no mapa.";

        }

    }

    catch (erro) {

        console.error(
            erro
        );


        if (status) {

            status.textContent =
                "Não consegui buscar. Marque no mapa.";

        }

    }

}


// ============================================================
// SALVAR LUGAR
// ============================================================

function salvarLugarAtual() {

    const nome =
        document
            .getElementById(
                "nomeLugar"
            )
            ?.value
            .trim();


    const endereco =
        document
            .getElementById(
                "enderecoLugar"
            )
            ?.value
            .trim() ||
        "";


    const icone =
        document
            .getElementById(
                "iconeLugar"
            )
            ?.value ||
        "📍";


    if (!nome) {

        alert(
            "Dê um nome para esse lugar."
        );


        return;

    }


    if (
        !Number.isFinite(
            lugarLatTemporario
        ) ||

        !Number.isFinite(
            lugarLonTemporario
        )
    ) {

        alert(
            "Defina a localização do lugar."
        );


        return;

    }


    const lugares =
        carregarLugares();


    if (
        lugarEmEdicaoId
    ) {

        const indice =
            lugares.findIndex(
                item =>
                    item.id ===
                    lugarEmEdicaoId
            );


        if (
            indice >= 0
        ) {

            lugares[indice] = {

                ...lugares[indice],

                nome,

                endereco,

                icone,

                lat:
                    lugarLatTemporario,

                lon:
                    lugarLonTemporario

            };

        }

    }

    else {

        lugares.push({

            id:
                gerarIdLugar(),

            nome,

            endereco,

            icone,

            lat:
                lugarLatTemporario,

            lon:
                lugarLonTemporario

        });

    }


    salvarLugares(
        lugares
    );


    renderizarLugaresMenu();


    fecharModalLugar();

}


// ============================================================
// EXCLUIR LUGAR
// ============================================================

function excluirLugarAtual() {

    if (
        !lugarEmEdicaoId
    ) {

        return;

    }


    const confirmar =
        confirm(
            "Excluir este lugar?"
        );


    if (!confirmar) {

        return;

    }


    const lugares =
        carregarLugares()
            .filter(
                item =>
                    item.id !==
                    lugarEmEdicaoId
            );


    salvarLugares(
        lugares
    );


    renderizarLugaresMenu();


    fecharModalLugar();

}


// ============================================================
// CLIQUE NO MAPA
// ============================================================

map.on(
    "click",
    evento => {

        if (
            !modoMarcarLugar
        ) {

            return;

        }


        lugarLatTemporario =
            Number(
                evento.latlng.lat
            );


        lugarLonTemporario =
            Number(
                evento.latlng.lng
            );


        modoMarcarLugar =
            false;


        document
            .getElementById(
                "aviso-marcar-lugar"
            )
            ?.classList
            .add(
                "oculto"
            );


        document
            .getElementById(
                "modalLugar"
            )
            ?.classList
            .remove(
                "oculto"
            );


        atualizarCoordenadasLugarNaTela();


        mostrarMarcadorLugarTemporario();

    }
);


// ============================================================
// DESTINO
// ============================================================

function mostrarMarcadorDestino(lugar) {

    if (
        marcadorDestino
    ) {

        map.removeLayer(
            marcadorDestino
        );

    }


    marcadorDestino =
        L.marker(
            [
                Number(
                    lugar.lat
                ),

                Number(
                    lugar.lon
                )
            ],
            {
                icon:
                    destinationIcon,

                zIndexOffset:
                    1100
            }
        )
        .addTo(map);


    marcadorDestino.bindTooltip(

        (
            lugar.icone ||
            "📍"
        ) +

        " " +

        lugar.nome

    );

}


// ============================================================
// API PARADAS
// ============================================================

async function buscarParadasApi(
    lat,
    lon
) {

    const resposta =
        await fetch(

            `/api/paradas?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&raio=${RAIO_KM}`,

            {
                cache:
                    "no-store"
            }

        );


    if (
        !resposta.ok
    ) {

        throw new Error(
            `HTTP ${resposta.status}`
        );

    }


    const dados =
        await resposta.json();


    return Array.isArray(dados)

        ? dados

        : [];

}


// ============================================================
// PARADAS POR DISTÂNCIA
// ============================================================

function prepararParadasPorDistancia(
    paradas,
    lat,
    lon,
    limite,
    maximo
) {

    return paradas

        .map(
            ponto => ({

                ...ponto,

                distanciaCalculada:
                    distanciaMetros(
                        lat,
                        lon,
                        Number(
                            ponto.py
                        ),
                        Number(
                            ponto.px
                        )
                    )

            })
        )

        .filter(
            ponto =>

                Number.isFinite(
                    ponto.distanciaCalculada
                ) &&

                ponto.distanciaCalculada <=
                limite
        )

        .sort(
            (
                a,
                b
            ) =>

                a.distanciaCalculada -
                b.distanciaCalculada
        )

        .slice(
            0,
            maximo
        );

}


// ============================================================
// LINHAS DA PARADA
// ============================================================

async function consultarLinhasParada(
    ponto,
    usarCache = true
) {

    const codigo =
        codigoDoPonto(
            ponto
        );


    if (!codigo) {

        throw new Error(
            "Ponto sem código."
        );

    }


    const cache =
        cacheLinhasParada.get(
            codigo
        );


    if (
        usarCache &&
        cache &&
        Date.now() -
        cache.criadoEm <
        15000
    ) {

        return cache.dados;

    }


    const resposta =
        await fetch(

            `/api/paradas/${encodeURIComponent(codigo)}/linhas`,

            {
                cache:
                    "no-store"
            }

        );


    if (
        !resposta.ok
    ) {

        throw new Error(
            `HTTP ${resposta.status}`
        );

    }


    const dados =
        await resposta.json();


    cacheLinhasParada.set(
        codigo,
        {
            criadoEm:
                Date.now(),

            dados
        }
    );


    return dados;

}


// ============================================================
// IR PARA LUGAR
// ============================================================

async function irParaLugar(id) {

    const lugar =
        carregarLugares()
            .find(
                item =>
                    item.id === id
            );


    if (!lugar) {

        return;

    }


    fecharMenu();


    fecharPainelPonto();


    abrirPainelRota(
        lugar
    );


    mostrarMarcadorDestino(
        lugar
    );


    if (
        !Number.isFinite(usuarioLat) ||
        !Number.isFinite(usuarioLon)
    ) {

        const lista =
            document.getElementById(
                "lista-rotas"
            );


        if (lista) {

            lista.innerHTML = `

                <div class="rota-vazio">

                    Ainda não consegui sua localização.

                    <br><br>

                    Toque no botão 📍 e tente novamente.

                </div>

            `;

        }


        return;

    }


    const limites =
        L.latLngBounds(

            [
                usuarioLat,
                usuarioLon
            ],

            [
                Number(
                    lugar.lat
                ),

                Number(
                    lugar.lon
                )
            ]

        );


    map.fitBounds(
        limites.pad(
            0.25
        )
    );


    await buscarRotasDiretas(
        lugar
    );

}


// ============================================================
// PAINEL ROTA
// ============================================================

function abrirPainelRota(lugar) {

    const nome =
        document.getElementById(
            "rota-destino-nome"
        );


    const endereco =
        document.getElementById(
            "rota-destino-endereco"
        );


    const lista =
        document.getElementById(
            "lista-rotas"
        );


    if (nome) {

        nome.textContent =

            (
                lugar.icone ||
                "📍"
            ) +

            " " +

            lugar.nome;

    }


    if (endereco) {

        endereco.textContent =

            lugar.endereco ||

            "Destino salvo";

    }


    if (lista) {

        lista.innerHTML = `

            <div class="carregando">

                Procurando pontos e linhas
                que levam até esse lugar...

            </div>

        `;

    }


    document
        .getElementById(
            "painel-rota"
        )
        ?.classList
        .remove(
            "oculto"
        );

}


function fecharPainelRota() {

    document
        .getElementById(
            "painel-rota"
        )
        ?.classList
        .add(
            "oculto"
        );

}


// ============================================================
// ROTAS DIRETAS
// ============================================================

async function buscarRotasDiretas(lugar) {

    const lista =
        document.getElementById(
            "lista-rotas"
        );


    if (!lista) {

        return;

    }


    try {

        const [
            paradasPertoUsuario,
            paradasPertoDestino
        ] =
            await Promise.all([

                buscarParadasApi(
                    usuarioLat,
                    usuarioLon
                ),

                buscarParadasApi(
                    Number(
                        lugar.lat
                    ),
                    Number(
                        lugar.lon
                    )
                )

            ]);


        const paradasOrigem =
            prepararParadasPorDistancia(

                paradasPertoUsuario,

                usuarioLat,
                usuarioLon,

                RAIO_ORIGEM_ROTA_M,

                MAX_PARADAS_ORIGEM

            );


        const paradasDestino =
            prepararParadasPorDistancia(

                paradasPertoDestino,

                Number(
                    lugar.lat
                ),

                Number(
                    lugar.lon
                ),

                RAIO_DESTINO_ROTA_M,

                MAX_PARADAS_DESTINO

            );


        if (
            !paradasOrigem.length ||
            !paradasDestino.length
        ) {

            lista.innerHTML = `

                <div class="rota-vazio">

                    Não encontrei pontos suficientes
                    perto de você ou do destino.

                </div>

            `;


            return;

        }


        const dadosOrigem =
            await Promise.all(

                paradasOrigem.map(

                    async ponto => ({

                        ponto,

                        dados:
                            await consultarLinhasParada(
                                ponto
                            )

                    })

                )

            );


        const dadosDestino =
            await Promise.all(

                paradasDestino.map(

                    async ponto => ({

                        ponto,

                        dados:
                            await consultarLinhasParada(
                                ponto
                            )

                    })

                )

            );


        const destinoPorServico =
            new Map();


        dadosDestino.forEach(
            item => {

                const linhas =
                    Array.isArray(
                        item.dados?.linhas
                    )

                        ? item.dados.linhas

                        : [];


                linhas.forEach(
                    linha => {

                        const chave =
                            chaveServico(
                                linha
                            );


                        const atual =
                            destinoPorServico.get(
                                chave
                            );


                        if (
                            !atual ||

                            item.ponto
                                .distanciaCalculada <

                            atual.ponto
                                .distanciaCalculada
                        ) {

                            destinoPorServico.set(
                                chave,
                                {
                                    ponto:
                                        item.ponto,

                                    linha
                                }
                            );

                        }

                    }
                );

            }
        );


        const melhores =
            new Map();


        dadosOrigem.forEach(
            item => {

                const linhas =
                    Array.isArray(
                        item.dados?.linhas
                    )

                        ? item.dados.linhas

                        : [];


                linhas.forEach(
                    linha => {

                        const chave =
                            chaveServico(
                                linha
                            );


                        const destinoMatch =
                            destinoPorServico.get(
                                chave
                            );


                        if (
                            !destinoMatch
                        ) {

                            return;

                        }


                        const previsoes =
                            (
                                Array.isArray(
                                    linha.previsoes
                                )

                                    ? linha.previsoes

                                    : []
                            )

                            .map(
                                previsao => ({

                                    ...previsao,

                                    minutos:
                                        minutosAteHorario(
                                            previsao.horario
                                        )

                                })
                            )

                            .filter(
                                previsao =>

                                    previsao.minutos !==
                                    null &&

                                    previsao.minutos >= 0 &&

                                    previsao.minutos <=
                                    LIMITE_PREVISAO_MIN
                            )

                            .sort(
                                (
                                    a,
                                    b
                                ) =>

                                    a.minutos -
                                    b.minutos
                            );


                        const espera =
                            previsoes.length

                                ? previsoes[0]
                                    .minutos

                                : 60;


                        const score =

                            item.ponto
                                .distanciaCalculada +

                            destinoMatch.ponto
                                .distanciaCalculada +

                            (
                                espera *
                                20
                            );


                        const candidato = {

                            linha,

                            origem:
                                item.ponto,

                            destino:
                                destinoMatch.ponto,

                            previsoes,

                            score

                        };


                        const existente =
                            melhores.get(
                                chave
                            );


                        if (
                            !existente ||
                            candidato.score <
                            existente.score
                        ) {

                            melhores.set(
                                chave,
                                candidato
                            );

                        }

                    }
                );

            }
        );


        const rotas =
            [
                ...melhores.values()
            ]

            .sort(
                (
                    a,
                    b
                ) =>

                    a.score -
                    b.score
            )

            .slice(
                0,
                8
            );


        renderizarRotasDiretas(
            rotas,
            lugar
        );

    }

    catch (erro) {

        console.error(
            "Erro ao buscar rotas:",
            erro
        );


        lista.innerHTML = `

            <div class="rota-vazio">

                Não consegui calcular
                as opções agora.

            </div>

        `;

    }

}


// ============================================================
// RENDERIZAR ROTAS
// ============================================================

function renderizarRotasDiretas(
    rotas,
    lugar
) {

    const lista =
        document.getElementById(
            "lista-rotas"
        );


    if (!lista) {

        return;

    }


    lista.innerHTML =
        "";


    if (
        !rotas.length
    ) {

        lista.innerHTML = `

            <div class="rota-vazio">

                <strong>
                    Nenhuma rota direta encontrada.
                </strong>

                <br><br>

                Não encontrei a mesma linha
                no mesmo sentido passando
                perto de você e perto de
                ${escaparHTML(lugar.nome)}.

            </div>

        `;


        return;

    }


    rotas.forEach(
        (
            rota,
            indice
        ) => {

            const primeira =
                rota.previsoes[0];


            let chegadaHTML = `

                <span class="rota-sem-previsao">

                    Sem previsão ao vivo

                </span>

            `;


            if (primeira) {

                const estado =
                    estadoDaPrevisao(
                        rota.linha,
                        primeira,
                        primeira.minutos
                    );


                chegadaHTML = `

                    <span
                        class="
                            rota-chegada
                            ${estado.classe}
                        "
                    >

                        ${
                            primeira.minutos === 0

                                ? "Chegando"

                                : primeira.minutos +
                                  " min"
                        }

                    </span>

                `;

            }


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "rota-card";


            card.innerHTML = `

                <div class="rota-card-topo">

                    <span class="rota-ranking">

                        ${
                            indice === 0

                                ? "MELHOR OPÇÃO"

                                : "OPÇÃO " +
                                  (
                                      indice + 1
                                  )
                        }

                    </span>


                    ${chegadaHTML}

                </div>


                <div class="rota-linha-numero">

                    ${escaparHTML(
                        numeroDaLinha(
                            rota.linha
                        )
                    )}

                </div>


                <div class="rota-linha-destino">

                    →
                    ${escaparHTML(
                        destinoDaLinha(
                            rota.linha
                        )
                    )}

                </div>


                <div class="rota-etapas">

                    <div class="rota-etapa">

                        <span>
                            🚶
                        </span>

                        <div>

                            <strong>

                                ${Math.round(
                                    rota.origem
                                        .distanciaCalculada
                                )}
                                m até o ponto

                            </strong>

                            <small>

                                ${escaparHTML(
                                    rota.origem.np ||
                                    "Ponto de embarque"
                                )}

                            </small>

                        </div>

                    </div>


                    <div class="rota-etapa">

                        <span>
                            🚌
                        </span>

                        <div>

                            <strong>

                                ${escaparHTML(
                                    numeroDaLinha(
                                        rota.linha
                                    )
                                )}

                            </strong>

                            <small>

                                Vá no sentido
                                ${escaparHTML(
                                    destinoDaLinha(
                                        rota.linha
                                    )
                                )}

                            </small>

                        </div>

                    </div>


                    <div class="rota-etapa">

                        <span>
                            🚏
                        </span>

                        <div>

                            <strong>

                                Desça em

                                ${escaparHTML(
                                    rota.destino.np ||
                                    "ponto próximo"
                                )}

                            </strong>

                            <small>

                                ${Math.round(
                                    rota.destino
                                        .distanciaCalculada
                                )}
                                m até

                                ${escaparHTML(
                                    lugar.nome
                                )}

                            </small>

                        </div>

                    </div>

                </div>


                <button
                    class="botao-ver-ponto-rota"
                    type="button"
                >

                    Ver ponto de embarque

                </button>

            `;


            card
                .querySelector(
                    ".botao-ver-ponto-rota"
                )
                ?.addEventListener(
                    "click",
                    () => {

                        fecharPainelRota();


                        map.setView(
                            [
                                Number(
                                    rota.origem.py
                                ),

                                Number(
                                    rota.origem.px
                                )
                            ],
                            17
                        );


                        abrirPonto(
                            rota.origem
                        );

                    }
                );


            lista.appendChild(
                card
            );

        }
    );

}


// ============================================================
// GPS
// ============================================================

function atualizarLocalizacao(
    lat,
    lon
) {

    usuarioLat =
        Number(
            lat
        );


    usuarioLon =
        Number(
            lon
        );


    if (
        !Number.isFinite(usuarioLat) ||
        !Number.isFinite(usuarioLon)
    ) {

        return;

    }


    if (
        usuarioMarker
    ) {

        map.removeLayer(
            usuarioMarker
        );

    }


    if (
        raioCircle
    ) {

        map.removeLayer(
            raioCircle
        );

    }


    usuarioMarker =
        L.marker(
            [
                usuarioLat,
                usuarioLon
            ],
            {
                icon:
                    userIcon,

                zIndexOffset:
                    1000
            }
        )
        .addTo(map);


    usuarioMarker.bindTooltip(
        "Você está aqui"
    );


    raioCircle =
        L.circle(
            [
                usuarioLat,
                usuarioLon
            ],
            {
                radius:
                    RAIO_KM *
                    1000,

                color:
                    "#5271ff",

                fillColor:
                    "#5271ff",

                fillOpacity:
                    .05,

                weight:
                    2
            }
        )
        .addTo(map);


    map.setView(
        [
            usuarioLat,
            usuarioLon
        ],
        14
    );


    criarPontosPerto();

}


function obterLocalizacaoReal() {

    if (
        !navigator.geolocation
    ) {

        alert(
            "Seu navegador não suporta localização."
        );


        return;

    }


    navigator.geolocation
        .getCurrentPosition(

            position => {

                atualizarLocalizacao(

                    position.coords.latitude,

                    position.coords.longitude

                );

            },


            erro => {

                console.error(
                    "Erro GPS:",
                    erro
                );

            },


            {
                enableHighAccuracy:
                    true,

                timeout:
                    20000,

                maximumAge:
                    0
            }

        );

}


function centralizarUsuario() {

    if (
        Number.isFinite(usuarioLat) &&
        Number.isFinite(usuarioLon)
    ) {

        map.setView(
            [
                usuarioLat,
                usuarioLon
            ],
            16
        );


        usuarioMarker
            ?.openTooltip();


        return;

    }


    obterLocalizacaoReal();

}


// ============================================================
// PONTOS DO MAPA
// ============================================================

function removerPontos() {

    pontosMarkers.forEach(
        marker => {

            map.removeLayer(
                marker
            );

        }
    );


    pontosMarkers =
        [];

}


async function criarPontosPerto() {

    if (
        !Number.isFinite(usuarioLat) ||
        !Number.isFinite(usuarioLon)
    ) {

        return;

    }


    removerPontos();


    try {

        const pontos =
            await buscarParadasApi(
                usuarioLat,
                usuarioLon
            );


        pontos.forEach(
            ponto => {

                const lat =
                    Number(
                        ponto.py
                    );


                const lon =
                    Number(
                        ponto.px
                    );


                if (
                    !Number.isFinite(lat) ||
                    !Number.isFinite(lon)
                ) {

                    return;

                }


                const marker =
                    L.marker(
                        [
                            lat,
                            lon
                        ],
                        {
                            icon:
                                stopIcon
                        }
                    )
                    .addTo(map);


                marker.bindTooltip(

                    escaparHTML(
                        ponto.np ||
                        "Ponto de ônibus"
                    )

                );


                marker.on(
                    "click",
                    evento => {

                        if (
                            evento.originalEvent
                        ) {

                            L.DomEvent
                                .stopPropagation(
                                    evento.originalEvent
                                );

                        }


                        abrirPonto(
                            ponto
                        );

                    }
                );


                pontosMarkers.push(
                    marker
                );

            }
        );


        console.log(
            "TOTAL DE PARADAS:",
            pontos.length
        );

    }

    catch (erro) {

        console.error(
            "Erro ao carregar paradas:",
            erro
        );

    }

}


// ============================================================
// PAINEL DO PONTO
// ============================================================

function elementosDoPainel() {

    return {

        painel:
            document.getElementById(
                "painel-ponto"
            ),

        nome:
            document.getElementById(
                "painel-nome-ponto"
            ),

        endereco:
            document.getElementById(
                "painel-endereco-ponto"
            ),

        lista:
            document.getElementById(
                "lista-linhas-ponto"
            )

    };

}


function pararAtualizacaoAutomatica() {

    if (
        timerAtualizacaoPonto
    ) {

        clearInterval(
            timerAtualizacaoPonto
        );


        timerAtualizacaoPonto =
            null;

    }

}


async function abrirPonto(ponto) {

    pararAtualizacaoAutomatica();


    fecharMenu();


    fecharPainelRota();


    pontoAbertoAtual =
        ponto;


    pontoAbertoIdAtual =
        codigoDoPonto(
            ponto
        );


    const {
        painel,
        nome,
        endereco,
        lista
    } =
        elementosDoPainel();


    if (
        !painel ||
        !nome ||
        !endereco ||
        !lista
    ) {

        return;

    }


    painel
        .classList
        .remove(
            "oculto"
        );


    nome.textContent =
        ponto.np ||
        "Ponto de ônibus";


    endereco.textContent =
        ponto.ed ||
        "";


    lista.innerHTML = `

        <div class="carregando">

            Buscando linhas e horários...

        </div>

    `;


    await buscarLinhasDoPonto(
        ponto
    );


    timerAtualizacaoPonto =
        setInterval(
            () => {

                if (
                    pontoAbertoIdAtual ===
                    codigoDoPonto(ponto)
                ) {

                    buscarLinhasDoPonto(
                        ponto
                    );

                }

            },

            INTERVALO_ATUALIZACAO_MS
        );

}


function fecharPainelPonto() {

    pararAtualizacaoAutomatica();


    pontoAbertoAtual =
        null;


    pontoAbertoIdAtual =
        null;


    elementosDoPainel()
        .painel
        ?.classList
        .add(
            "oculto"
        );

}


// ============================================================
// BUSCAR LINHAS DO PONTO
// ============================================================

async function buscarLinhasDoPonto(
    ponto
) {

    const lista =
        elementosDoPainel()
            .lista;


    if (!lista) {

        return;

    }


    try {

        const dados =
            await consultarLinhasParada(
                ponto,
                false
            );


        if (
            pontoAbertoIdAtual !==
            codigoDoPonto(ponto)
        ) {

            return;

        }


        const linhas =
            Array.isArray(
                dados?.linhas
            )

                ? dados.linhas

                : [];


        lista.innerHTML =
            "";


        if (
            dados?.horarioConsulta
        ) {

            const atualizado =
                document.createElement(
                    "div"
                );


            atualizado.className =
                "carregando";


            atualizado.textContent =
                `Atualizado às ${dados.horarioConsulta}`;


            lista.appendChild(
                atualizado
            );

        }


        if (
            !linhas.length
        ) {

            lista.innerHTML += `

                <div class="carregando">

                    Nenhuma linha encontrada neste ponto.

                </div>

            `;


            return;

        }


        linhas

            .slice()

            .sort(
                (
                    a,
                    b
                ) =>

                    numeroDaLinha(a)
                        .localeCompare(
                            numeroDaLinha(b),
                            "pt-BR"
                        )
            )

            .forEach(
                linha => {

                    renderizarCardLinha(
                        lista,
                        linha,
                        ponto
                    );

                }
            );

    }

    catch (erro) {

        console.error(
            "Erro ao buscar linhas:",
            erro
        );


        lista.innerHTML = `

            <div class="carregando">

                Não foi possível carregar as linhas.

            </div>

        `;

    }

}


// ============================================================
// CARD DA LINHA
// ============================================================

function renderizarCardLinha(
    container,
    linha,
    ponto
) {

    const numero =
        numeroDaLinha(
            linha
        );


    const destino =
        destinoDaLinha(
            linha
        );


    const origem =
        origemDaLinha(
            linha
        );


    const reviews =
        reviewsDaLinha(
            linha
        );


    const media =
        calcularMediaReviews(
            reviews
        );


    const previsoes =
        (
            Array.isArray(
                linha.previsoes
            )

                ? linha.previsoes

                : []
        )

        .map(
            previsao => ({

                ...previsao,

                minutos:
                    minutosAteHorario(
                        previsao.horario
                    )

            })
        )

        .filter(
            previsao =>

                previsao.minutos !==
                null &&

                previsao.minutos >= 0 &&

                previsao.minutos <=
                LIMITE_PREVISAO_MIN
        )

        .sort(
            (
                a,
                b
            ) =>

                a.minutos -
                b.minutos
        );


    let previsoesHTML =
        "";


    previsoes.forEach(
        previsao => {

            const estado =
                estadoDaPrevisao(

                    linha,

                    previsao,

                    previsao.minutos

                );


            const tempo =

                previsao.minutos === 0

                    ? "Chegando"

                    : previsao.minutos +
                      " min";


            previsoesHTML += `

                <div
                    class="
                        previsao-item
                        ${estado.classe}
                    "
                >

                    <div>

                        <div class="previsao-horario">

                            ${escaparHTML(
                                previsao.horario
                            )}

                        </div>


                        <div class="previsao-label">

                            ${escaparHTML(
                                estado.texto
                            )}

                        </div>

                    </div>


                    <div class="previsao-minutos">

                        ${escaparHTML(
                            tempo
                        )}

                    </div>

                </div>

            `;

        }
    );


    if (
        !previsoesHTML
    ) {

        previsoesHTML = `

            <div class="carregando">

                Nenhum ônibus previsto
                nos próximos 40 minutos.

            </div>

        `;

    }


    const card =
        document.createElement(
            "div"
        );


    card.className =
        "linha-onibus-card";


    card.innerHTML = `

        <div class="linha-cabecalho">

            <div>

                <div class="linha-destino-destaque">

                    ${escaparHTML(
                        destino
                    )}

                </div>


                <div class="linha-numero">

                    ${escaparHTML(
                        numero
                    )}

                </div>


                <div class="linha-destino">

                    ${
                        origem

                            ? "De " +
                              escaparHTML(
                                  origem
                              )

                            : ""
                    }

                </div>

            </div>


            <div class="linha-qtd">

                ${previsoes.length}
                em até 40 min

            </div>

        </div>


        <div class="linha-avaliacao-resumo">

            <span class="estrelas-pequenas">

                ${
                    reviews.length

                        ? estrelasHTML(
                            media
                        )

                        : "☆☆☆☆☆"
                }

            </span>


            <span>

                ${
                    reviews.length

                        ? media
                            .toFixed(1)
                            .replace(".", ",")

                        : "Sem nota"
                }

            </span>


            <span class="quantidade-avaliacoes">

                ${reviews.length}

                ${
                    reviews.length === 1

                        ? "avaliação"

                        : "avaliações"
                }

            </span>

        </div>


        <div class="titulo-previsoes">

            PRÓXIMOS 40 MINUTOS

        </div>


        ${previsoesHTML}


        <div class="acoes-linha">

            <button
                class="botao-reviews"
                type="button"
            >
                Avaliações
            </button>


            <button
                class="botao-avaliar"
                type="button"
            >
                Avaliar
            </button>

        </div>

    `;


    card
        .querySelector(
            ".botao-reviews"
        )
        ?.addEventListener(
            "click",
            () => {

                abrirModalReviews(
                    linha,
                    ponto
                );

            }
        );


    card
        .querySelector(
            ".botao-avaliar"
        )
        ?.addEventListener(
            "click",
            () => {

                abrirModalAvaliacao(
                    linha,
                    ponto
                );

            }
        );


    container.appendChild(
        card
    );

}


// ============================================================
// AVALIAÇÕES - STORAGE
// ============================================================

function carregarAvaliacoes() {

    try {

        const dados =
            JSON.parse(

                localStorage.getItem(
                    "busreview_avaliacoes"
                ) ||

                "[]"

            );


        return Array.isArray(dados)

            ? dados

            : [];

    }

    catch {

        return [];

    }

}


function salvarAvaliacoes(lista) {

    localStorage.setItem(

        "busreview_avaliacoes",

        JSON.stringify(
            lista
        )

    );

}


function reviewsDaLinha(linha) {

    const chave =
        chaveDaLinha(
            linha
        );


    return carregarAvaliacoes()

        .filter(
            review =>

                String(
                    review.linha
                ) ===
                chave
        )

        .sort(
            (
                a,
                b
            ) =>

                new Date(
                    b.data
                ) -

                new Date(
                    a.data
                )
        );

}


function calcularMediaReviews(
    reviews
) {

    if (!reviews.length) {

        return 0;

    }


    return (

        reviews.reduce(
            (
                total,
                review
            ) =>

                total +
                Number(
                    review.nota ||
                    0
                ),

            0
        ) /

        reviews.length

    );

}


function estrelasHTML(nota) {

    const valor =
        Math.round(
            Number(nota) ||
            0
        );


    let texto =
        "";


    for (
        let i = 1;
        i <= 5;
        i++
    ) {

        texto +=

            i <= valor

                ? "★"

                : "☆";

    }


    return texto;

}


// ============================================================
// MODAL AVALIAÇÃO
// ============================================================

function abrirModalAvaliacao(
    linha,
    ponto
) {

    linhaEmAvaliacao =
        linha;


    pontoEmAvaliacao =
        ponto;


    notaAtual =
        0;


    const titulo =
        document.getElementById(
            "tituloAvaliacao"
        );


    const subtitulo =
        document.getElementById(
            "subtituloAvaliacao"
        );


    const texto =
        document.getElementById(
            "textoAvaliacao"
        );


    const lotacao =
        document.getElementById(
            "lotacaoAvaliacao"
        );


    const atraso =
        document.getElementById(
            "atrasoAvaliacao"
        );


    if (titulo) {

        titulo.textContent =

            `Avaliar ${numeroDaLinha(linha)} → ${destinoDaLinha(linha)}`;

    }


    if (subtitulo) {

        subtitulo.textContent =

            ponto?.np ||

            "Ponto de ônibus";

    }


    if (texto) {

        texto.value =
            "";

    }


    if (lotacao) {

        lotacao.value =
            "";

    }


    if (atraso) {

        atraso.value =
            "";

    }


    atualizarEstrelas();


    document
        .getElementById(
            "modalAvaliacao"
        )
        ?.classList
        .remove(
            "oculto"
        );

}


function fecharModalAvaliacao() {

    document
        .getElementById(
            "modalAvaliacao"
        )
        ?.classList
        .add(
            "oculto"
        );

}


function definirNota(nota) {

    notaAtual =
        Number(
            nota
        );


    atualizarEstrelas();

}


function atualizarEstrelas() {

    document
        .querySelectorAll(
            "#estrelasAvaliacao button"
        )
        .forEach(
            (
                botao,
                indice
            ) => {

                botao.classList.toggle(

                    "ativa",

                    indice <
                    notaAtual

                );

            }
        );

}


function enviarAvaliacao() {

    if (
        !linhaEmAvaliacao
    ) {

        return;

    }


    if (
        notaAtual < 1
    ) {

        alert(
            "Escolha uma nota."
        );


        return;

    }


    const comentario =
        document
            .getElementById(
                "textoAvaliacao"
            )
            ?.value
            .trim();


    if (
        !comentario
    ) {

        alert(
            "Escreva um comentário."
        );


        return;

    }


    const reviews =
        carregarAvaliacoes();


    reviews.push({

        id:
            Date.now(),

        linha:
            chaveDaLinha(
                linhaEmAvaliacao
            ),

        numero:
            numeroDaLinha(
                linhaEmAvaliacao
            ),

        destino:
            destinoDaLinha(
                linhaEmAvaliacao
            ),

        sentido:
            Number(
                linhaEmAvaliacao.sentido
            ) || null,

        ponto:
            pontoEmAvaliacao?.np ||
            "",

        nota:
            notaAtual,

        comentario,

        lotacao:
            document
                .getElementById(
                    "lotacaoAvaliacao"
                )
                ?.value ||
            "",

        atraso:
            document
                .getElementById(
                    "atrasoAvaliacao"
                )
                ?.value ||
            "",

        data:
            new Date()
                .toISOString()

    });


    salvarAvaliacoes(
        reviews
    );


    fecharModalAvaliacao();


    if (
        pontoAbertoAtual
    ) {

        buscarLinhasDoPonto(
            pontoAbertoAtual
        );

    }

}


// ============================================================
// MODAL DE REVIEWS
// ============================================================

function abrirModalReviews(
    linha,
    ponto
) {

    linhaReviewsAtual =
        linha;


    pontoReviewsAtual =
        ponto;


    filtroReviewsAtual =
        0;


    const titulo =
        document.getElementById(
            "tituloReviews"
        );


    if (titulo) {

        titulo.textContent =

            `${numeroDaLinha(linha)} → ${destinoDaLinha(linha)}`;

    }


    atualizarFiltroVisual();


    renderizarReviews();


    document
        .getElementById(
            "modalReviews"
        )
        ?.classList
        .remove(
            "oculto"
        );

}


function fecharModalReviews() {

    document
        .getElementById(
            "modalReviews"
        )
        ?.classList
        .add(
            "oculto"
        );

}


function filtrarReviews(nota) {

    filtroReviewsAtual =
        Number(
            nota
        );


    atualizarFiltroVisual();


    renderizarReviews();

}


function atualizarFiltroVisual() {

    document
        .querySelectorAll(
            "#filtrosReviews button"
        )
        .forEach(
            botao => {

                botao.classList.toggle(

                    "ativo",

                    Number(
                        botao.dataset.nota
                    ) ===
                    filtroReviewsAtual

                );

            }
        );

}


// ============================================================
// RENDERIZAR REVIEWS
// ============================================================

function renderizarReviews() {

    if (
        !linhaReviewsAtual
    ) {

        return;

    }


    const todas =
        reviewsDaLinha(
            linhaReviewsAtual
        );


    const media =
        calcularMediaReviews(
            todas
        );


    const mediaEl =
        document.getElementById(
            "reviewsMedia"
        );


    const estrelasEl =
        document.getElementById(
            "reviewsEstrelasMedia"
        );


    const quantidadeEl =
        document.getElementById(
            "reviewsQuantidade"
        );


    if (mediaEl) {

        mediaEl.textContent =

            todas.length

                ? media
                    .toFixed(1)
                    .replace(".", ",")

                : "0,0";

    }


    if (estrelasEl) {

        estrelasEl.textContent =
            estrelasHTML(
                media
            );

    }


    if (quantidadeEl) {

        quantidadeEl.textContent =

            `${todas.length} ${

                todas.length === 1

                    ? "avaliação"

                    : "avaliações"

            }`;

    }


    const distribuicao =
        document.getElementById(
            "reviewsDistribuicao"
        );


    if (distribuicao) {

        distribuicao.innerHTML =
            "";


        for (
            let nota = 5;
            nota >= 1;
            nota--
        ) {

            const quantidade =
                todas.filter(
                    review =>

                        Number(
                            review.nota
                        ) === nota
                )
                .length;


            const porcentagem =

                todas.length

                    ? (
                        quantidade /
                        todas.length
                    ) * 100

                    : 0;


            distribuicao.innerHTML += `

                <div class="distribuicao-linha">

                    <span>
                        ${nota}★
                    </span>


                    <div class="distribuicao-barra">

                        <div
                            class="distribuicao-preenchimento"
                            style="width:${porcentagem}%"
                        ></div>

                    </div>


                    <span>
                        ${quantidade}
                    </span>

                </div>

            `;

        }

    }


    const filtradas =

        filtroReviewsAtual === 0

            ? todas

            : todas.filter(
                review =>

                    Number(
                        review.nota
                    ) ===
                    filtroReviewsAtual
            );


    const lista =
        document.getElementById(
            "listaReviews"
        );


    if (!lista) {

        return;

    }


    lista.innerHTML =
        "";


    if (
        !filtradas.length
    ) {

        lista.innerHTML = `

            <div class="sem-reviews">

                Nenhuma avaliação ainda.

            </div>

        `;


        return;

    }


    filtradas.forEach(
        review => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "review-item";


            const data =
                new Date(
                    review.data
                )
                .toLocaleDateString(
                    "pt-BR"
                );


            let tags =
                "";


            if (
                review.lotacao
            ) {

                tags += `

                    <span class="review-tag">

                        Lotação:
                        ${escaparHTML(
                            review.lotacao
                        )}

                    </span>

                `;

            }


            if (
                review.atraso
            ) {

                tags += `

                    <span class="review-tag">

                        Atraso:
                        ${escaparHTML(
                            review.atraso
                        )}

                    </span>

                `;

            }


            item.innerHTML = `

                <div class="review-topo">

                    <span class="review-estrelas">

                        ${estrelasHTML(
                            review.nota
                        )}

                    </span>


                    <span class="review-data">

                        ${escaparHTML(
                            data
                        )}

                    </span>

                </div>


                <div class="review-comentario">

                    ${escaparHTML(
                        review.comentario
                    )}

                </div>


                ${
                    tags

                        ? `
                            <div class="review-tags">

                                ${tags}

                            </div>
                        `

                        : ""
                }

            `;


            lista.appendChild(
                item
            );

        }
    );

}


// ============================================================
// AVALIAR PELO MODAL DE REVIEWS
// ============================================================

function avaliarPeloModalReviews() {

    if (
        !linhaReviewsAtual
    ) {

        return;

    }


    const linha =
        linhaReviewsAtual;


    const ponto =
        pontoReviewsAtual;


    fecharModalReviews();


    abrirModalAvaliacao(
        linha,
        ponto
    );

}


// ============================================================
// INICIAR BUSREVIEW
// ============================================================

function iniciarBusReview() {

    console.log(
        "BUSREVIEW INICIADO"
    );


    renderizarLugaresMenu();


    setTimeout(
        () => {

            map.invalidateSize();

        },
        100
    );


    obterLocalizacaoReal();

}


// ============================================================
// START
// ============================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(

        "DOMContentLoaded",

        iniciarBusReview,

        {
            once: true
        }

    );

}

else {

    iniciarBusReview();

}