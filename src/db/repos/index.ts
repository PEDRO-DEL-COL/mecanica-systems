import { db } from '../client';
import { criarRepoClientes } from './clientes';
import { criarRepoVeiculos } from './veiculos';

export const clientesRepo = criarRepoClientes(db);
export const veiculosRepo = criarRepoVeiculos(db);
export { ErroValidacao } from './tipos';