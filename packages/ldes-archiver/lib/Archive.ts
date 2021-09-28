import { readdir } from 'fs/promises';
import type { IWritableConnector, IArchiveExtension } from '@ldes/types';
import type * as RDF from '@rdfjs/types';
import * as N3 from 'n3';
import { DataFactory } from 'rdf-data-factory';
import { helpers } from './utils/Helpers';

const BYTE_THRESHOLD = 50_000;

export interface IArchiveOptions {
  outputDirectory: string;
  url: string;
  timestampPredicate: string;
  extension?: IArchiveExtension;
}

export interface IExtensionOptions {
  connectionString: string;
  containerName: string;
}

export class Archive implements IWritableConnector {
  public readonly outputDirectory: string;
  public readonly extension: IArchiveExtension;
  public readonly timestampProperty: RDF.NamedNode;

  public readonly factory: RDF.DataFactory;
  public readonly bucketPredicate: RDF.NamedNode;

  public constructor(
    outputDirectory: string,
    timestampPredicate: string,
    extension?: IArchiveExtension | undefined,
  ) {
    this.factory = new DataFactory();
    this.outputDirectory = outputDirectory;
    this.timestampProperty = this.factory.namedNode(timestampPredicate);
    this.bucketPredicate = this.factory.namedNode('https://w3id.org/ldes#bucket');

    if (extension) {
      this.extension = extension!;
    }
  }

  public stop = async (): Promise<void> => {
    throw new Error(`Not implemented.`);
  };

  public async provision(): Promise<void> {
    try {
      await Promise.all([helpers.createDirectory(this.outputDirectory), this.extension?.provision()]);
    } catch (error: unknown) {
      console.error(error);
    }
  }

  public async writeVersion(quads: RDF.Quad[]): Promise<void> {
    const bucketTriples = this.getBucketTriples(quads);

    if (bucketTriples.length > 0) {
      bucketTriples.forEach(async triple => {
        const bucket = triple.object.value;
        const bucketPath = `${this.outputDirectory}/${bucket}.ttl`;
        quads = quads.filter(quad => !bucketTriples.includes(quad));

        await this.writeToBucket(bucketPath, quads);
      });
    } else {
      const outputFile = 'result.ttl';
    }
  }

  public flush = async (): Promise<void> => {
    if (this.extension !== undefined) {
      const files = await readdir(this.outputDirectory);

      if (files.length > 0) {
        const tasks: Promise<void>[] = [];

        files.forEach(file => {
          tasks.push(this.extension.pushToStorage(file));
        });

        await Promise.all(tasks);
      }
    }
  };

  private readonly getBucketTriples = (quads: RDF.Quad[]): RDF.Quad[] =>
    quads.filter(quad => quad.predicate.equals(this.bucketPredicate));

  private readonly writeToBucket = async (bucketPath: string, quads: RDF.Quad[]): Promise<void> => {
    const writer = new N3.Writer();
    writer.addQuads(quads);
    writer.end(async (error, result) => {
      if (error) {
        throw new Error(error.stack);
      }
      await helpers.appendToBucket(bucketPath, result);
    });
  };
}
