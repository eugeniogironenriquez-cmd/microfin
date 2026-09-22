import { Module, Controller, Injectable, Get, Param } from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags } from '@nestjs/swagger';
import { State, Municipality } from '../common/entities';
import { Auth } from '../common/guards/roles.guard';

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(State) private stateRepo: Repository<State>,
    @InjectRepository(Municipality) private munRepo: Repository<Municipality>,
  ) {}

  getStates(): Promise<State[]> {
    return this.stateRepo.find({ order: { name: 'ASC' } });
  }

  getMunicipalities(stateId: number): Promise<Municipality[]> {
    return this.munRepo.find({ where: { stateId }, order: { name: 'ASC' } });
  }
}

@ApiTags('locations')
@Controller('locations')
export class LocationController {
  constructor(private locationService: LocationService) {}

  @Get('states')
  @Auth()
  getStates() { return this.locationService.getStates(); }

  @Get('states/:stateId/municipalities')
  @Auth()
  getMunicipalities(@Param('stateId') stateId: number) {
    return this.locationService.getMunicipalities(Number(stateId));
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([State, Municipality])],
  providers: [LocationService],
  controllers: [LocationController],
  exports: [LocationService],
})
export class LocationModule {}
