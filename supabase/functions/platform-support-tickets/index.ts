import {ticketHandler} from './handler.ts';
Deno.serve(ticketHandler(key=>Deno.env.get(key)));
