import {enrollmentHandler} from './handler.ts';
Deno.serve(enrollmentHandler(key=>Deno.env.get(key)));
