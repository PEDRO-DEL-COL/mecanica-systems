import { db } from '../client';
import { criarRepoCatalogo } from './catalogo';
import { criarRepoClientes } from './clientes';
import { criarRepoVeiculos } from './veiculos';

export const clientesRepo = criarRepoClientes(db);
export const veiculosRepo = criarRepoVeiculos(db);
export const catalogoRepo = criarRepoCatalogo(db);
export { ErroValidacao } from './tipos';