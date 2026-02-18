from typing import Any, Dict, List, Optional, Union

from pydantic import AliasChoices, BaseModel, Field


class Participant(BaseModel):
    id: int
    name: str
    meta: Optional[dict] = None
    image_path: Optional[str] = None
    logo_path: Optional[str] = None
    image: Optional[Union[dict, str]] = None
    logo: Optional[Union[dict, str]] = None


class Statistic(BaseModel):
    team_id: Optional[int] = Field(default=None, validation_alias=AliasChoices("team_id", "participant_id"))
    participant_id: Optional[int] = None
    type_id: Optional[int] = None
    type: Optional[dict] = None
    data: Optional[dict] = None
    shots: Optional[float] = None
    shots_on_target: Optional[float] = Field(default=None, alias="shots_on_target")
    possession: Optional[float] = None
    dangerous_attacks: Optional[float] = None
    goals: Optional[float] = None


class WeatherReport(BaseModel):
    temperature: Optional[Any] = None
    wind: Optional[Any] = None
    humidity: Optional[Any] = None
    type: Optional[str] = None


class Referee(BaseModel):
    id: Optional[int] = None
    fixture_id: Optional[int] = None
    referee_id: Optional[int] = None
    type_id: Optional[int] = None
    name: Optional[str] = None
    yellow_cards_per_game: Optional[float] = None
    penalties_per_game: Optional[float] = None


class FixtureData(BaseModel):
    id: int
    league_id: Optional[int] = None
    starting_at: Optional[str] = None
    participants: List[Participant]
    statistics: Optional[List[Statistic]] = None
    trends: Optional[list] = None
    weatherreport: Optional[WeatherReport] = Field(
        default=None, validation_alias=AliasChoices("weatherreport", "weatherReport")
    )
    lineups: Optional[list] = None
    sidelined: Optional[list] = None
    referees: Optional[List[Referee]] = None
    referee: Optional[Referee] = None  # some payloads use singular key
    formations: Optional[list] = None
    ballCoordinates: Optional[list] = Field(
        default=None, validation_alias=AliasChoices("ballCoordinates", "ball_coordinates", "ballcoordinates")
    )
    scores: Optional[Union[List[dict], Dict[str, Any]]] = None
    odds: Optional[list] = None


class FixturePayload(BaseModel):
    data: FixtureData
