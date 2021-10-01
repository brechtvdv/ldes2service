import type * as RDF from '@rdfjs/types';
import { findNodes } from 'clownface-shacl-path';
import { DataFactory } from 'rdf-data-factory';
const { dataset } = require('@rdfjs/dataset');
const clownface = require('clownface');
const N3 = require('n3');

export abstract class IBucketizer {
  public readonly propertyPathQuads: RDF.Quad[];
  public readonly factory: RDF.DataFactory;

  public constructor(propertyPath: string) {
    this.factory = new DataFactory();
    this.propertyPathQuads = this.parsePropertyPath(propertyPath);
  }

  /**
   * Adds extra triples to the array of quads indicating
   * the buckets in which the version object must be placed
   */
  public abstract bucketize: (quads: RDF.Quad[], memberId: string) => void;

  public abstract createBuckets: (propertyPathObject: RDF.Term) => string[];

  /**
   * Returns the RDF Term that matches the property path and will be used to create a bucket triple
   * @param memberQuads an array of quads representing a member
   * @param memberId identifier of the member
   * @returns an RDF Term
   */
  public extractPropertyPathObject = (memberQuads: RDF.Quad[], memberId: string): RDF.Term => {
    const entryBlankNode = this.getEntryBlanknode().object;
    const data = clownface({ dataset: dataset(memberQuads) }).namedNode(memberId);
    const path = clownface({ dataset: dataset(this.propertyPathQuads) }).blankNode(entryBlankNode);
    return findNodes(data, path).term;
  };

  public createBucketTriple = (bucket: string, memberId: string): RDF.Quad => this.factory.quad(
    this.factory.namedNode(memberId),
    this.factory.namedNode('https://w3id.org/ldes#bucket'),
    this.factory.literal(bucket, this.factory.namedNode('http://www.w3.org/2001/XMLSchema#string')),
  );

  private readonly parsePropertyPath = (propertyPath: string): RDF.Quad[] => {
    const fullPath = `_:b0 <https://w3id.org/tree#path> ${propertyPath} .`;
    const propertyPathQuads: RDF.Quad[] = [];

    const parser = new N3.Parser();
    parser.parse(fullPath, (error: any, quad: any, prefixes: any) => {
      if (error) {
        throw new Error(error.stack);
      }

      if (quad) {
        propertyPathQuads.push(quad);
      }
    });

    return propertyPathQuads;
  };

  private readonly getEntryBlanknode = (): RDF.Quad =>
    this.propertyPathQuads.find(quad => quad.predicate.value === 'https://w3id.org/tree#path')!;
}
