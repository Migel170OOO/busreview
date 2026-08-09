* {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family: Arial, sans-serif;

    background: #111827;
    color: white;
}


/* CABEÇALHO */

header {
    height: 65px;

    background: #5271FF;

    display: flex;
    align-items: center;

    padding: 0 25px;

    position: relative;
    z-index: 1000;
}

.logo {
    font-size: 23px;
    font-weight: bold;
}


/* CONTEÚDO */

main {
    max-width: 900px;
    margin: auto;
}


/* HERO */

.hero {
    padding: 30px 20px;
}

.hero h1 {
    margin-bottom: 8px;
}

.hero p {
    color: #aeb6c7;
}


/* DESTINOS */

.destinos {
    display: grid;

    grid-template-columns:
        repeat(4, 1fr);

    gap: 12px;

    margin-top: 25px;
}

.destinos button {
    border: 1px solid #374151;

    background: #1f2937;

    color: white;

    border-radius: 15px;

    padding: 18px 8px;

    cursor: pointer;

    font-size: 24px;
}

.destinos button:hover {
    border-color: #5271FF;
}

.destinos span {
    display: block;

    font-size: 14px;

    margin-top: 7px;
}


/* MAPA */

.map-container {
    width: 100%;
}

#map {
    width: 100%;
    height: 430px;
}


/* LINHAS */

.linhas {
    padding: 25px 20px;
}

.linhas h2 {
    margin-bottom: 15px;
}


.linha-card {
    background: #1f2937;

    border: 1px solid #374151;

    border-radius: 15px;

    padding: 18px;

    margin-bottom: 12px;

    cursor: pointer;
}

.linha-card:hover {
    border-color: #5271FF;
}


.linha-topo {
    display: flex;

    justify-content: space-between;

    align-items: center;
}


.numero {
    font-size: 21px;

    font-weight: bold;
}


.tempo {
    color: #72e06a;

    font-weight: bold;
}


.status {
    color: #aeb6c7;

    margin-top: 8px;

    font-size: 14px;
}


/* DETALHES */

.detalhes {
    display: none;

    margin: 20px;

    padding: 25px;

    background: #1f2937;

    border-radius: 18px;
}


.voltar {
    border: none;

    background: transparent;

    color: #8fa4ff;

    cursor: pointer;

    font-size: 15px;

    margin-bottom: 15px;
}


.informacoes {
    display: grid;

    grid-template-columns:
        repeat(2, 1fr);

    gap: 12px;

    margin-top: 20px;
}


.info {
    background: #111827;

    border-radius: 12px;

    padding: 17px;
}


.info small {
    display: block;

    color: #9ca3af;

    margin-bottom: 8px;
}


.info strong {
    font-size: 18px;
}


/* AVALIAÇÃO */

.avaliacao {
    margin-top: 30px;
}


.estrelas {
    display: flex;

    gap: 7px;
}


.estrelas button {
    background: #111827;

    border: none;

    color: #777;

    font-size: 30px;

    cursor: pointer;

    border-radius: 8px;
}


.estrelas button:hover {
    color: #FFD43B;
}


#mensagemAvaliacao {
    color: #72e06a;
}


/* CELULAR */

@media (max-width: 600px) {

    .destinos {
        grid-template-columns:
            repeat(2, 1fr);
    }

    #map {
        height: 350px;
    }

    .informacoes {
        grid-template-columns:
            1fr;
    }

}
