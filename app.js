// ==========================================
// MAPA
// ==========================================

const map = L.map("map").setView(
    [-23.5505, -46.6333],
    13
);


L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
        attribution:
            "&copy; OpenStreetMap &copy; CARTO"
    }
).addTo(map);


// ==========================================
// PONTOS DE ÔNIBUS
// ==========================================

const pontos = [

    {
        nome: "Ponto Interlagos",
        lat: -23.7015,
        lon: -46.7020
    },

    {
        nome: "Ponto Autódromo",
        lat: -23.7035,
        lon: -46.6990
    },

    {
        nome: "Ponto Avenida",
        lat: -23.7060,
        lon: -46.7050
    }

];


pontos.forEach(ponto => {

    const marker = L.marker([
        ponto.lat,
        ponto.lon
    ]).addTo(map);


    marker.bindPopup(`
        <b>${ponto.nome}</b>

        <br>

        🚌 675A

        <br>

        🚌 6021
    `);

});


// ==========================================
// LOCALIZAÇÃO
// ==========================================

if (
    navigator.geolocation
) {

    navigator.geolocation.getCurrentPosition(

        function(position) {

            const lat =
                position.coords.latitude;

            const lon =
                position.coords.longitude;


            L.marker([
                lat,
                lon
            ])
            .addTo(map)
            .bindPopup(
                "📍 Você está aqui"
            );


            map.setView(
                [lat, lon],
                14
            );

        },

        function() {

            console.log(
                "Localização não disponível."
            );

        }

    );

}


// ==========================================
// LINHAS
// ==========================================

const linhas = [

    {
        numero: "675A",

        tempo: 6,

        duracao: 28,

        confiabilidade: 96,

        lotacao: "🟡 Cheio",

        status:
            "🟢 Operação normal"
    },


    {
        numero: "6021",

        tempo: 11,

        duracao: 31,

        confiabilidade: 88,

        lotacao: "🟢 Normal",

        status:
            "🟢 Operação normal"
    },


    {
        numero: "637V",

        tempo: 18,

        duracao: 35,

        confiabilidade: 61,

        lotacao: "🔴 Muito cheio",

        status:
            "🟠 Movimento acima do normal"
    }

];


// ==========================================
// MOSTRAR LINHAS
// ==========================================

function mostrarLinhas() {

    const lista =
        document.getElementById(
            "listaLinhas"
        );


    lista.innerHTML = "";


    linhas.forEach(linha => {

        const card =
            document.createElement(
                "div"
            );


        card.className =
            "linha-card";


        card.onclick = function() {

            abrirLinha(
                linha,
                "home"
            );

        };


        card.innerHTML = `

            <div class="linha-topo">

                <div class="numero">
                    ${linha.numero}
                </div>

                <div class="tempo">
                    ${linha.tempo} min
                </div>

            </div>

            <div class="status">

                ${linha.status}

                ·

                Confiabilidade:
                ${linha.confiabilidade}%

            </div>

        `;


        lista.appendChild(card);

    });

}


mostrarLinhas();


// ==========================================
// ESCOLHER DESTINO
// ==========================================

function buscarDestino(destino) {

    document.getElementById(
        "home"
    ).style.display = "none";


    document.getElementById(
        "rotas"
    ).style.display = "block";


    document.getElementById(
        "tituloDestino"
    ).textContent =
        "Rotas para " + destino;


    mostrarRotas();

}


// ==========================================
// MOSTRAR ROTAS
// ==========================================

function mostrarRotas() {

    const lista =
        document.getElementById(
            "listaRotas"
        );


    lista.innerHTML = "";


    linhas.forEach(linha => {

        const card =
            document.createElement(
                "div"
            );


        card.className =
            "rota-card";


        card.onclick = function() {

            abrirLinha(
                linha,
                "rotas"
            );

        };


        card.innerHTML = `

            <div class="rota-topo">

                <div class="rota-numero">

                    ${linha.numero}

                </div>

                <div class="rota-tempo">

                    ${linha.tempo} min

                </div>

            </div>


            <div class="rota-info">

                Viagem:
                ${linha.duracao} min

                <br>

                Confiabilidade:
                ${linha.confiabilidade}%

                <br>

                Lotação:
                ${linha.lotacao}

            </div>

        `;


        lista.appendChild(card);

    });

}


// ==========================================
// ABRIR DETALHES
// ==========================================

let telaAnterior = "home";


function abrirLinha(
    linha,
    origem
) {

    telaAnterior = origem;


    document.getElementById(
        "home"
    ).style.display = "none";


    document.getElementById(
        "rotas"
    ).style.display = "none";


    document.getElementById(
        "detalhes"
    ).style.display = "block";


    document.getElementById(
        "linhaNome"
    ).textContent =
        linha.numero;


    document.getElementById(
        "linhaStatus"
    ).textContent =
        linha.status;


    document.getElementById(
        "tempo"
    ).textContent =
        linha.tempo + " min";


    document.getElementById(
        "confiabilidade"
    ).textContent =
        linha.confiabilidade + "%";


    document.getElementById(
        "lotacao"
    ).textContent =
        linha.lotacao;


    document.getElementById(
        "duracao"
    ).textContent =
        linha.duracao + " min";

}


// ==========================================
// VOLTAR PARA HOME
// ==========================================

function voltarHome() {

    document.getElementById(
        "rotas"
    ).style.display = "none";


    document.getElementById(
        "detalhes"
    ).style.display = "none";


    document.getElementById(
        "home"
    ).style.display = "block";

}


// ==========================================
// VOLTAR DAS ROTAS
// ==========================================

function voltarRotas() {

    document.getElementById(
        "detalhes"
    ).style.display = "none";


    if (
        telaAnterior === "rotas"
    ) {

        document.getElementById(
            "rotas"
        ).style.display = "block";

    } else {

        document.getElementById(
            "home"
        ).style.display = "block";

    }

}


// ==========================================
// AVALIAÇÃO
// ==========================================

function avaliar(nota) {

    document.getElementById(
        "mensagemAvaliacao"
    ).textContent =

        "Obrigado! Você deu " +
        nota +
        " estrela(s) para esta viagem.";

}
