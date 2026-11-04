/**
 * FACADES-2 (LATER 112): the world model's own facade nodes -- MP7's moon and stars, MP52's pipes, M72's smoke columns, 23
 * nodes on 7 maps -- are drawn as props since the draw walk turns them as it turns a prop's (`FUN_003389c0`
 * D:L236080-236081 -> `FUN_00317fc0`): `loadMap`'s `place` files them under the world model's own name. They are the
 * world's, not a prototype's: the forge offers, places and hides none (its server reads no `worldmodel` placement,
 * `archiveParts`), and the test room's texture sets count them as world draws. A module of its own, with no imports, so
 * the match server's forge reads it as the page does.
 */
export const WORLD_FACADE_MODEL = 'worldmodel';

/** Whether a prop entry (`LoadedMap.props`) is the world model's own facade nodes. */
export const isWorldFacadeProp = (p: { readonly modelName: string }): boolean => p.modelName === WORLD_FACADE_MODEL;
